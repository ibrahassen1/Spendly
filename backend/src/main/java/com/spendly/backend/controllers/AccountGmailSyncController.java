package com.spendly.backend.controllers;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.spendly.backend.dto.GmailAlertResponse;
import com.spendly.backend.services.GmailService;
import java.math.BigDecimal;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

/**
 * Uses the original production GmailService parser, but isolates credentials,
 * transactions and balance lookups by the verified Clerk user subject.
 */
@RestController
@RequestMapping("/api/account/gmail")
public class AccountGmailSyncController {
    private final JdbcTemplate db;
    private final GmailService parser;
    private final ObjectMapper json = new ObjectMapper();
    private final HttpClient http = HttpClient.newHttpClient();
    @Value("${GOOGLE_CLIENT_ID:}") private String clientId;
    @Value("${GOOGLE_CLIENT_SECRET:}") private String clientSecret;
    @Value("${GMAIL_TOKEN_ENCRYPTION_KEY:}") private String encryptionKey;

    public AccountGmailSyncController(JdbcTemplate db,GmailService parser) {
        this.db=db;this.parser=parser;
    }
    private String decrypt(String ciphertext) throws Exception {
        byte[] key=Base64.getDecoder().decode(encryptionKey);
        if(key.length!=32)throw new IllegalStateException("Invalid Gmail encryption key");
        byte[] bytes=Base64.getDecoder().decode(ciphertext);
        if(bytes.length<29)throw new IllegalStateException("Invalid encrypted token");
        byte[] iv=java.util.Arrays.copyOfRange(bytes,0,12);
        Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE,new SecretKeySpec(key,"AES"),new GCMParameterSpec(128,iv));
        return new String(cipher.doFinal(bytes,12,bytes.length-12),StandardCharsets.UTF_8);
    }
    private JsonNode request(HttpRequest req) throws Exception {
        HttpResponse<String> result=http.send(req,HttpResponse.BodyHandlers.ofString());
        if(result.statusCode()<200||result.statusCode()>=300)
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,"Google API request failed");
        return json.readTree(result.body());
    }
    private String accessToken(String user) throws Exception {
        var encrypted=db.query("SELECT encrypted_refresh_token FROM account_gmail_connections WHERE user_id=?",
            (rs,i)->rs.getString(1),user);
        if(encrypted.isEmpty())throw new ResponseStatusException(HttpStatus.CONFLICT,"Connect Gmail first");
        String form="client_id="+URLEncoder.encode(clientId,StandardCharsets.UTF_8)
            +"&client_secret="+URLEncoder.encode(clientSecret,StandardCharsets.UTF_8)
            +"&refresh_token="+URLEncoder.encode(decrypt(encrypted.get(0)),StandardCharsets.UTF_8)
            +"&grant_type=refresh_token";
        JsonNode token=request(HttpRequest.newBuilder(URI.create("https://oauth2.googleapis.com/token"))
            .header("Content-Type","application/x-www-form-urlencoded")
            .POST(HttpRequest.BodyPublishers.ofString(form)).build());
        String access=token.path("access_token").asText("");
        if(access.isBlank())throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,"Gmail token refresh failed");
        return access;
    }
    private record Candidate(String messageId,GmailAlertResponse alert) {}
    private List<Candidate> candidates(String user) throws Exception {
        LocalDate start=db.query("SELECT COALESCE((SELECT tracking_start_date FROM account_gmail_tracking_settings WHERE user_id=?),start_date) FROM account_safe_balances WHERE user_id=?",
            (rs,i)->rs.getDate(1).toLocalDate(),user,user).stream().findFirst()
            .orElseThrow(()->new ResponseStatusException(HttpStatus.CONFLICT,"Set opening balance first"));
        String access=accessToken(user);
        String query="{from:alerts@notify.wellsfargo.com from:capitalone@notification.capitalone.com} after:"
            +start.minusDays(1).format(DateTimeFormatter.ofPattern("yyyy/MM/dd"));
        String base="https://gmail.googleapis.com/gmail/v1/users/me/messages";
        List<Candidate> result=new ArrayList<>();
        String page=null;
        int pages=0;
        do {
            String url=base+"?maxResults=100&q="+URLEncoder.encode(query,StandardCharsets.UTF_8)
                +(page==null?"":"&pageToken="+URLEncoder.encode(page,StandardCharsets.UTF_8));
            JsonNode found=request(HttpRequest.newBuilder(URI.create(url)).header("Authorization","Bearer "+access).GET().build());
            for(JsonNode msg:found.path("messages")) {
                String id=msg.path("id").asText("");
                if(id.isBlank())continue;
                try {
                    GmailAlertResponse alert=parser.parseMessageWithAccessToken(id,access);
                    if(alert.date()!=null && !alert.date().isBefore(start))result.add(new Candidate(id,alert));
                } catch (Exception parseError) {
                    // Do not log email bodies, card data or access tokens.
                    org.slf4j.LoggerFactory.getLogger(getClass()).warn("Skipped unparsable Gmail alert: {}",parseError.getClass().getSimpleName());
                }
            }
            page=found.path("nextPageToken").asText(null);
            pages++;
        } while(page!=null && !page.isBlank() && pages<10);
        return result;
    }
    @PostMapping("/sync")
    public Map<String,Object> sync(@AuthenticationPrincipal Jwt jwt) throws Exception {
        String user=jwt.getSubject();
        List<Candidate> found=candidates(user);
        return save(user,found);
    }
    @Transactional
    protected Map<String,Object> save(String user,List<Candidate> found) {
        db.queryForObject("SELECT allocation FROM account_safe_balances WHERE user_id=? FOR UPDATE",BigDecimal.class,user);
        int imported=0;
        for(Candidate c:found) {
            GmailAlertResponse a=c.alert();
            imported+=db.update("INSERT INTO account_gmail_transactions(user_id,gmail_message_id,merchant,amount,transaction_date,transaction_time,card_last4,source_bank) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(user_id,gmail_message_id) DO NOTHING",
                user,c.messageId(),a.merchant(),a.amount(),a.date(),a.transactionTime(),a.cardLast4(),a.sourceBank());
        }
        return Map.of("found",found.size(),"imported",imported,
            "message",imported>0?"New purchases imported":found.isEmpty()?"No matching purchases found":"Purchases already synced");
    }
}
