package com.spendly.backend.controllers;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.*;
import java.util.regex.*;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/gmail/transactions")
public class GmailSyncController {
 private final JdbcTemplate db;
 private final RestClient http=RestClient.create();
 private final ObjectMapper json=new ObjectMapper();
 @Value("${GOOGLE_CLIENT_ID:}") String clientId;
 @Value("${GOOGLE_CLIENT_SECRET:}") String clientSecret;
 @Value("${GMAIL_TOKEN_ENCRYPTION_KEY:}") String key;
 private static final Pattern AMOUNT=Pattern.compile("(?i)(?:purchase|transaction|spent|charged|debit card purchase)[^[$]]{0,150}[$]\\s*([0-9]{1,7}(?:,[0-9]{3})*\\.[0-9]{2})");
 public GmailSyncController(JdbcTemplate db){this.db=db;}
 private String decrypt(String value){
  try {
   byte[] k=Base64.getDecoder().decode(key),data=Base64.getDecoder().decode(value);
   if(k.length!=32||data.length<29)throw new IllegalStateException("Invalid token encryption settings");
   Cipher c=Cipher.getInstance("AES/GCM/NoPadding");
   c.init(Cipher.DECRYPT_MODE,new SecretKeySpec(k,"AES"),new GCMParameterSpec(128,Arrays.copyOfRange(data,0,12)));
   return new String(c.doFinal(Arrays.copyOfRange(data,12,data.length)),StandardCharsets.UTF_8);
  }catch(Exception ex){throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"Unable to decrypt Gmail connection");}
 }
 private String accessToken(String user){
  var rows=db.query("SELECT encrypted_refresh_token FROM gmail_connections WHERE user_id=?",(rs,i)->rs.getString(1),user);
  if(rows.isEmpty())throw new ResponseStatusException(HttpStatus.CONFLICT,"Connect Gmail first");
  try {
   String form="client_id="+java.net.URLEncoder.encode(clientId,StandardCharsets.UTF_8)
    +"&client_secret="+java.net.URLEncoder.encode(clientSecret,StandardCharsets.UTF_8)
    +"&refresh_token="+java.net.URLEncoder.encode(decrypt(rows.get(0)),StandardCharsets.UTF_8)
    +"&grant_type=refresh_token";
   String response=http.post().uri("https://oauth2.googleapis.com/token").contentType(MediaType.APPLICATION_FORM_URLENCODED)
    .body(form).retrieve().body(String.class);
   return json.readTree(response).path("access_token").asText();
  }catch(Exception ex){throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,"Gmail token refresh failed; reconnect Gmail");}
 }
 private JsonNode get(String token,String uri){
  try{
   String body=http.get().uri(uri).header("Authorization","Bearer "+token).retrieve().body(String.class);
   return json.readTree(body);
  }catch(Exception ex){throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,"Unable to retrieve Gmail messages");}
 }
 private String header(JsonNode msg,String key){
  for(JsonNode h:msg.path("payload").path("headers"))if(key.equalsIgnoreCase(h.path("name").asText()))return h.path("value").asText("");
  return "";
 }
 private record Candidate(String id,String merchant,BigDecimal amount,LocalDate date){}
 private List<Candidate> candidates(String user){
  String token=accessToken(user);
  // Only recent Wells Fargo purchase notifications, not arbitrary email or historical mail.
  String query=java.net.URLEncoder.encode("newer_than:7d from:(wellsfargo.com) (purchase OR transaction)",StandardCharsets.UTF_8);
  JsonNode list=get(token,"https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=50&q="+query);
  List<Candidate> found=new ArrayList<>();
  for(JsonNode item:list.path("messages")){
   String id=item.path("id").asText("");
   if(!id.matches("[A-Za-z0-9_-]{5,100}"))continue;
   JsonNode msg=get(token,"https://gmail.googleapis.com/gmail/v1/users/me/messages/"+id+"?format=metadata&metadataHeaders=From&metadataHeaders=Subject");
   String from=header(msg,"From").toLowerCase(Locale.ROOT);
   if(!from.matches("(?s).*@[a-z0-9.-]*wellsfargo\\.com(?:>|\\s|$).*"))continue;
   String subject=header(msg,"Subject");
   String snippet=msg.path("snippet").asText("");
   String content=subject+" "+snippet;
   if(!content.toLowerCase(Locale.ROOT).matches("(?s).*(purchase|debit card purchase).*"))continue;
   Matcher match=AMOUNT.matcher(content);
   if(!match.find())continue;
   try{
    BigDecimal amount=new BigDecimal(match.group(1).replace(",",""));
    if(amount.signum()<=0||amount.compareTo(new BigDecimal("10000"))>0)continue;
    long millis=Long.parseLong(msg.path("internalDate").asText("0"));
    LocalDate date=java.time.Instant.ofEpochMilli(millis).atZone(java.time.ZoneOffset.UTC).toLocalDate();
    if(date.isBefore(LocalDate.now(java.time.ZoneOffset.UTC).minusDays(8)))continue;
    String merchant=subject.length()>120?subject.substring(0,120):subject;
    found.add(new Candidate(id,merchant,amount,date));
   }catch(Exception ignored){}
  }
  return found;
 }
 @GetMapping
 public List<Map<String,Object>> history(@AuthenticationPrincipal Jwt jwt){
  return db.query("SELECT gmail_message_id,merchant,amount,transaction_date FROM gmail_transactions WHERE user_id=? ORDER BY transaction_date DESC,created_at DESC LIMIT 100",
   (rs,i)->Map.<String,Object>of("id",rs.getString(1),"merchant",rs.getString(2),"amount",rs.getBigDecimal(3),"date",rs.getDate(4).toLocalDate().toString()),jwt.getSubject());
 }
 @PostMapping("/preview")
 public Map<String,Object> preview(@AuthenticationPrincipal Jwt jwt){
  List<Candidate> found=candidates(jwt.getSubject());
  return Map.of("count",found.size(),"candidates",found.stream().map(c->Map.of("id",c.id,"merchant",c.merchant,"amount",c.amount,"date",c.date.toString())).toList(),
   "message","Preview only. No money has been deducted.");
 }
 @PostMapping("/apply")
 @Transactional
 public Map<String,Object> apply(@AuthenticationPrincipal Jwt jwt,@RequestBody Map<String,Object> request){
  // Explicit user confirmation is required; automatic background deductions stay disabled.
  if(!Boolean.TRUE.equals(request.get("confirm")))throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Confirmation required");
  String user=jwt.getSubject();
  List<Candidate> found=candidates(user);
  var balance=db.query("SELECT allocation FROM user_safe_balances WHERE user_id=? FOR UPDATE",(rs,i)->rs.getBigDecimal(1),user);
  if(balance.isEmpty())throw new ResponseStatusException(HttpStatus.CONFLICT,"Submit a paycheck first");
  int inserted=0;BigDecimal deducted=BigDecimal.ZERO;
  for(Candidate c:found){
   int n=db.update("INSERT INTO gmail_transactions(user_id,gmail_message_id,merchant,amount,transaction_date) VALUES(?,?,?,?,?) ON CONFLICT DO NOTHING",
     user,c.id,c.merchant,c.amount,c.date);
   if(n==1){inserted++;deducted=deducted.add(c.amount);}
  }
  if(deducted.signum()>0)db.update("UPDATE user_safe_balances SET allocation=allocation-? WHERE user_id=?",deducted,user);
  return Map.of("imported",inserted,"deducted",deducted,"message","Only new Gmail message IDs were deducted");
 }
}
