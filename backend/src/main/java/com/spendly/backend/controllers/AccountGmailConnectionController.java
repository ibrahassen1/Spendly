package com.spendly.backend.controllers;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.Map;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/account/gmail/connection")
public class AccountGmailConnectionController {
    private final JdbcTemplate db;
    private final SecureRandom random = new SecureRandom();
    private final RestClient http = RestClient.create();
    @Value("${GOOGLE_CLIENT_ID:}") private String clientId;
    @Value("${GOOGLE_CLIENT_SECRET:}") private String clientSecret;
    @Value("${GOOGLE_GMAIL_REDIRECT_URI:}") private String redirectUri;
    @Value("${GMAIL_TOKEN_ENCRYPTION_KEY:}") private String encryptionKey;
    @Value("${SPENDLY_FRONTEND_URL:http://localhost:5173}") private String frontendUrl;

    public AccountGmailConnectionController(JdbcTemplate db) { this.db = db; }

    private static String url(String v) { return URLEncoder.encode(v, StandardCharsets.UTF_8); }
    private static String hash(String v) {
        try {
            byte[] bytes = MessageDigest.getInstance("SHA-256").digest(v.getBytes(StandardCharsets.UTF_8));
            return java.util.HexFormat.of().formatHex(bytes);
        } catch (Exception e) { throw new IllegalStateException(e); }
    }
    private void configured() {
        if (clientId.isBlank() || clientSecret.isBlank() || redirectUri.isBlank() || encryptionKey.isBlank())
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Gmail OAuth not configured");
    }
    private String encrypt(String token) throws Exception {
        byte[] key = Base64.getDecoder().decode(encryptionKey);
        if (key.length != 32) throw new IllegalStateException("Invalid Gmail encryption key");
        byte[] iv = new byte[12];
        random.nextBytes(iv);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(key, "AES"), new GCMParameterSpec(128, iv));
        byte[] encrypted = cipher.doFinal(token.getBytes(StandardCharsets.UTF_8));
        byte[] result = new byte[12 + encrypted.length];
        System.arraycopy(iv, 0, result, 0, 12);
        System.arraycopy(encrypted, 0, result, 12, encrypted.length);
        return Base64.getEncoder().encodeToString(result);
    }
    @GetMapping("/status")
    public Map<String, Boolean> status(@AuthenticationPrincipal Jwt jwt) {
        Integer count = db.queryForObject("SELECT COUNT(*) FROM account_gmail_connections WHERE user_id=?", Integer.class, jwt.getSubject());
        return Map.of("connected", count != null && count > 0);
    }
    @PostMapping("/start")
    public Map<String, String> start(@AuthenticationPrincipal Jwt jwt) {
        configured();
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        String state = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        db.update("INSERT INTO account_gmail_oauth_states(state_hash,user_id,expires_at) VALUES(?,?,?)",
            hash(state), jwt.getSubject(), LocalDateTime.now().plusMinutes(10));
        String target = "https://accounts.google.com/o/oauth2/v2/auth?response_type=code&client_id=" + url(clientId)
            + "&redirect_uri=" + url(redirectUri)
            + "&scope=" + url("https://www.googleapis.com/auth/gmail.readonly")
            + "&access_type=offline&prompt=consent&state=" + url(state);
        return Map.of("authorizationUrl", target);
    }
    @GetMapping("/callback")
    public ResponseEntity<Void> callback(@RequestParam(required=false) String code,
                                          @RequestParam(required=false) String state,
                                          @RequestParam(required=false) String error) {
        if (state == null || !state.matches("[A-Za-z0-9_-]{40,100}"))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid OAuth state");
        var users = db.query("DELETE FROM account_gmail_oauth_states WHERE state_hash=? AND expires_at>CURRENT_TIMESTAMP RETURNING user_id",
            (rs,i) -> rs.getString(1), hash(state));
        if (users.isEmpty()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Expired or reused OAuth state");
        if (error != null || code == null || code.isBlank())
            return ResponseEntity.status(302).location(URI.create(frontendUrl + "/?gmail=cancelled")).build();
        configured();
        try {
            String form = "code=" + url(code) + "&client_id=" + url(clientId)
                + "&client_secret=" + url(clientSecret) + "&redirect_uri=" + url(redirectUri)
                + "&grant_type=authorization_code";
            String body = http.post().uri("https://oauth2.googleapis.com/token")
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .body(form).retrieve().body(String.class);
            JsonNode tokens = new ObjectMapper().readTree(body);
            String refresh = tokens.path("refresh_token").asText("");
            if (refresh.isBlank()) throw new IllegalStateException("No refresh token returned");
            db.update("INSERT INTO account_gmail_connections(user_id,encrypted_refresh_token) VALUES(?,?) "
                + "ON CONFLICT(user_id) DO UPDATE SET encrypted_refresh_token=EXCLUDED.encrypted_refresh_token,connected_at=CURRENT_TIMESTAMP",
                users.get(0), encrypt(refresh));
            return ResponseEntity.status(302).location(URI.create(frontendUrl + "/?gmail=connected")).build();
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Gmail authorization failed");
        }
    }
    @DeleteMapping
    public ResponseEntity<Void> disconnect(@AuthenticationPrincipal Jwt jwt) {
        db.update("DELETE FROM account_gmail_connections WHERE user_id=?", jwt.getSubject());
        return ResponseEntity.noContent().build();
    }
}
