package com.spendly.backend.controllers;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Map;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/** Gmail account linking only. Does not modify financial balances or legacy Gmail tables. */
@RestController
@RequestMapping("/api/account/gmail")
public class AccountGmailController {
    private final JdbcTemplate jdbc;
    private final String clientId;
    private final String clientSecret;
    private final String redirectUri;
    private final String encryptionKey;
    private final SecureRandom random = new SecureRandom();
    private final HttpClient http = HttpClient.newHttpClient();
    private final ObjectMapper mapper = new ObjectMapper();

    public AccountGmailController(JdbcTemplate jdbc,
        @Value("${google.client-id}") String clientId,
        @Value("${google.client-secret}") String clientSecret,
        @Value("${google.redirect-uri}") String redirectUri,
        @Value("${spendly.gmail.token-encryption-key:}") String encryptionKey) {
        this.jdbc=jdbc; this.clientId=clientId; this.clientSecret=clientSecret;
        this.redirectUri=redirectUri; this.encryptionKey=encryptionKey;
    }
    private String user(Jwt jwt) {
        if (jwt==null || jwt.getSubject()==null || jwt.getSubject().isBlank())
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        return jwt.getSubject();
    }
    private String hash(String value) throws Exception {
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
            .digest(value.getBytes(StandardCharsets.UTF_8)));
    }
    private String encode(String value) { return URLEncoder.encode(value,StandardCharsets.UTF_8); }
    private SecretKeySpec key() {
        try {
            byte[] bytes=Base64.getDecoder().decode(encryptionKey);
            if(bytes.length!=32) throw new IllegalArgumentException();
            return new SecretKeySpec(bytes,"AES");
        } catch(Exception ex) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                "Gmail encryption key is not configured");
        }
    }
    private String encrypt(String token) throws Exception {
        byte[] iv=new byte[12]; random.nextBytes(iv);
        Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE,key(),new GCMParameterSpec(128,iv));
        byte[] encrypted=cipher.doFinal(token.getBytes(StandardCharsets.UTF_8));
        return Base64.getEncoder().encodeToString(iv)+"."+Base64.getEncoder().encodeToString(encrypted);
    }
    @PostMapping("/connect")
    public Map<String,String> connect(@AuthenticationPrincipal Jwt jwt) throws Exception {
        String id=user(jwt);
        key(); // Fail before issuing an OAuth state when encryption is unavailable.
        byte[] bytes=new byte[32];random.nextBytes(bytes);
        String state=Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        jdbc.update("INSERT INTO user_gmail_oauth_states(state_hash,user_id,expires_at) VALUES(?,?,?)",
            hash(state),id,LocalDateTime.now().plusMinutes(10));
        String url="https://accounts.google.com/o/oauth2/v2/auth?client_id="+encode(clientId)
            +"&redirect_uri="+encode(redirectUri)+"&response_type=code"
            +"&scope="+encode("https://www.googleapis.com/auth/gmail.readonly")
            +"&access_type=offline&prompt=consent&state="+encode(state);
        return Map.of("authorizationUrl",url);
    }
    @GetMapping("/status")
    public Map<String,Boolean> status(@AuthenticationPrincipal Jwt jwt) {
        Integer count=jdbc.queryForObject(
            "SELECT COUNT(*) FROM user_gmail_connections WHERE user_id=?",Integer.class,user(jwt));
        return Map.of("connected",count!=null && count>0);
    }
    @DeleteMapping("/connection")
    public ResponseEntity<Void> disconnect(@AuthenticationPrincipal Jwt jwt) {
        jdbc.update("DELETE FROM user_gmail_connections WHERE user_id=?",user(jwt));
        return ResponseEntity.noContent().build();
    }
    @GetMapping("/callback")
    @Transactional(rollbackFor=Exception.class)
    public ResponseEntity<String> callback(@RequestParam String code,@RequestParam String state) throws Exception {
        if(state.isBlank() || code.isBlank()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        String hashed=hash(state);
        var owners=jdbc.query("SELECT user_id FROM user_gmail_oauth_states WHERE state_hash=? AND expires_at>CURRENT_TIMESTAMP FOR UPDATE",
            (rs,n)->rs.getString(1),hashed);
        if(owners.isEmpty()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Expired or invalid OAuth state");
        jdbc.update("DELETE FROM user_gmail_oauth_states WHERE state_hash=?",hashed);
        String body="code="+encode(code)+"&client_id="+encode(clientId)
            +"&client_secret="+encode(clientSecret)+"&redirect_uri="+encode(redirectUri)
            +"&grant_type=authorization_code";
        HttpRequest request=HttpRequest.newBuilder(URI.create("https://oauth2.googleapis.com/token"))
            .header("Content-Type","application/x-www-form-urlencoded")
            .POST(HttpRequest.BodyPublishers.ofString(body)).build();
        HttpResponse<String> response=http.send(request,HttpResponse.BodyHandlers.ofString());
        if(response.statusCode()!=200) throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,"Google OAuth exchange failed");
        JsonNode data=mapper.readTree(response.body());
        String refreshToken=data.path("refresh_token").asText("");
        if(refreshToken.isBlank()) throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,"Google did not return a refresh token");
        jdbc.update("INSERT INTO user_gmail_connections(user_id,encrypted_refresh_token) VALUES(?,?) "
            +"ON CONFLICT(user_id) DO UPDATE SET encrypted_refresh_token=EXCLUDED.encrypted_refresh_token,connected_at=CURRENT_TIMESTAMP",
            owners.get(0),encrypt(refreshToken));
        return ResponseEntity.ok("Gmail connected to Spendly. You can close this tab.");
    }
}
