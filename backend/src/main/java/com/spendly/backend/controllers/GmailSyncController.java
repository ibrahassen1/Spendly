package com.spendly.backend.controllers;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.Instant;
import java.time.ZoneId;
import java.time.Month;
import java.time.format.DateTimeFormatter;
import com.spendly.backend.dto.GmailAlertResponse;
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
    private static final String WELLS_FARGO_SENDER =
            "alerts@notify.wellsfargo.com";

    private static final String DISCOVER_SENDER =
            "capitalone@notification.capitalone.com";

    private static final ZoneId TRANSACTION_ZONE =
            ZoneId.of("America/New_York");

    private static final Pattern WF_AMOUNT_PATTERN =
            Pattern.compile(
                    "(?:purchase(?:\\s+amount)?(?:\\s+of)?|amount:)\\s*\\$([0-9]+(?:\\.[0-9]{1,2})?)",
                    Pattern.CASE_INSENSITIVE
            );

    private static final Pattern WF_CARD_PATTERN =
            Pattern.compile(
                    "(?:card(?:\\s+number)?[^0-9]{0,30})(?:\\.\\.\\.|\\*+)?([0-9]{4})",
                    Pattern.CASE_INSENSITIVE
            );

    private static final Pattern WF_MERCHANT_PATTERN =
            Pattern.compile(
                    "Merchant\\s*:\\s*(.+?)(?="
                            + "\\s+Date\\s*:"
                            + "|\\s+Wells\\s+Fargo\\s+Alert"
                            + "|\\s+Don't\\s+recognize"
                            + "|\\s+Card\\s+Controls"
                            + "|\\s+If\\s+you\\s+don't\\s+recognize"
                            + "|$)",
                    Pattern.CASE_INSENSITIVE
            );

    private static final Pattern WF_DATE_PATTERN =
            Pattern.compile(
                    "Date\\s*:\\s*(\\d{1,2}/\\d{1,2}/\\d{4})",
                    Pattern.CASE_INSENSITIVE
            );

    private static final Pattern DISCOVER_CARD_PATTERN =
            Pattern.compile(
                    "Card\\s+ending\\s+in\\s+(\\d{4})",
                    Pattern.CASE_INSENSITIVE
            );

    private static final Pattern DISCOVER_TRANSACTION_PATTERN =
            Pattern.compile(
                    "on\\s+([A-Za-z]{3})\\.?\\s+(\\d{1,2}),\\s+(\\d{4}),\\s+at\\s+(.+?),\\s+a\\s+pending\\s+authorization\\s+or\\s+purchase\\s+in\\s+the\\s+amount\\s+of\\s+\\$([0-9]+(?:\\.[0-9]{1,2})?)",
                    Pattern.CASE_INSENSITIVE
            );


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
  LocalDate startDate=db.query("SELECT start_date FROM user_safe_balances WHERE user_id=?",(rs,i)->rs.getDate(1).toLocalDate(),user).stream().findFirst().orElseThrow(()->new ResponseStatusException(HttpStatus.CONFLICT,"Submit a paycheck first"));
  String after=startDate.minusDays(1).format(DateTimeFormatter.ofPattern("yyyy/MM/dd"));
  String query=java.net.URLEncoder.encode("{from:"+WELLS_FARGO_SENDER+" from:"+DISCOVER_SENDER+"} after:"+after,StandardCharsets.UTF_8);
  JsonNode list=get(token,"https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=100&q="+query);
  List<Candidate> found=new ArrayList<>();
  for(JsonNode item:list.path("messages")){
   String id=item.path("id").asText("");
   if(!id.matches("[A-Za-z0-9_-]{5,100}"))continue;
   try{
    JsonNode msg=get(token,"https://gmail.googleapis.com/gmail/v1/users/me/messages/"+id+"?format=full");
    String sender=extractHeader(msg,"From").toLowerCase(Locale.ROOT);
    String content=normalize(normalize(msg.path("snippet").asText(""))+" "+normalize(extractMessageText(msg.path("payload"))));
    LocalDateTime fallback=dateTimeFromInternalTimestamp(msg.path("internalDate").asText(""));
    LocalDate fallbackDate=fallback==null?null:fallback.toLocalDate();
    GmailAlertResponse alert;
    if(sender.contains(WELLS_FARGO_SENDER))alert=parseWellsFargoAlert(content,fallbackDate,fallback);
    else if(sender.contains(DISCOVER_SENDER))alert=parseDiscoverAlert(content,fallbackDate,fallback);
    else continue;
    if(alert.amount().signum()<=0)continue;
    found.add(new Candidate(id,alert.merchant(),alert.amount(),alert.date()));
   }catch(RuntimeException ex){System.err.println("Failed to parse Gmail message "+id+": "+ex.getMessage());}
  }
  return found;
 }
    private String extractMessageText(
            JsonNode payload
    ) {
        StringBuilder text =
                new StringBuilder();

        extractMessageTextRecursive(
                payload,
                text
        );

        return text.toString();
    }

    private void extractMessageTextRecursive(
            JsonNode part,
            StringBuilder text
    ) {

        if (part == null
                || part.isMissingNode()) {
            return;
        }

        String mimeType =
                part.path("mimeType")
                        .asText("");

        String data =
                part.path("body")
                        .path("data")
                        .asText("");

        if (!data.isBlank()
                && (
                mimeType.equalsIgnoreCase("text/plain")
                        || mimeType.equalsIgnoreCase("text/html")
        )) {

            String decoded =
                    decodeBase64Url(
                            data
                    );

            if (mimeType.equalsIgnoreCase("text/html")) {
                decoded =
                        htmlToText(
                                decoded
                        );
            }

            text.append(" ")
                    .append(decoded);
        }

        JsonNode parts =
                part.path("parts");

        if (parts.isArray()) {
            for (JsonNode child : parts) {
                extractMessageTextRecursive(
                        child,
                        text
                );
            }
        }
    }

    private String decodeBase64Url(
            String encoded
    ) {

        try {
            byte[] decoded =
                    Base64.getUrlDecoder()
                            .decode(encoded);

            return new String(
                    decoded,
                    StandardCharsets.UTF_8
            );

        } catch (IllegalArgumentException exception) {
            return "";
        }
    }

    private String htmlToText(
            String html
    ) {

        return html
                .replaceAll(
                        "(?is)<style[^>]*>.*?</style>",
                        " "
                )
                .replaceAll(
                        "(?is)<script[^>]*>.*?</script>",
                        " "
                )
                .replaceAll(
                        "(?i)<br\\s*/?>",
                        " "
                )
                .replaceAll(
                        "(?i)</p>",
                        " "
                )
                .replaceAll(
                        "<[^>]+>",
                        " "
                )
                .replace("&nbsp;", " ")
                .replace("&#160;", " ")
                .replace("&amp;", "&")
                .replace("&quot;", "\"")
                .replace("&#39;", "'")
                .replace("&apos;", "'");
    }

    private String extractHeader(
            JsonNode message,
            String headerName
    ) {

        JsonNode headers =
                message.path("payload")
                        .path("headers");

        if (!headers.isArray()) {
            return "";
        }

        for (JsonNode header : headers) {
            if (headerName.equalsIgnoreCase(
                    header.path("name")
                            .asText("")
            )) {
                return header.path("value")
                        .asText("");
            }
        }

        return "";
    }

    private GmailAlertResponse parseWellsFargoAlert(
            String text,
            LocalDate fallbackDate,
            LocalDateTime fallbackTimestamp
    ) {

        Matcher amountMatcher =
                WF_AMOUNT_PATTERN.matcher(text);

        Matcher cardMatcher =
                WF_CARD_PATTERN.matcher(text);

        Matcher merchantMatcher =
                WF_MERCHANT_PATTERN.matcher(text);

        Matcher dateMatcher =
                WF_DATE_PATTERN.matcher(text);

        if (!amountMatcher.find()) {
            throw new RuntimeException(
                    "Could not parse amount from Wells Fargo email"
            );
        }

        if (!cardMatcher.find()) {
            throw new RuntimeException(
                    "Could not parse card from Wells Fargo email"
            );
        }

        if (!merchantMatcher.find()) {
            throw new RuntimeException(
                    "Could not parse merchant from Wells Fargo email"
            );
        }

        BigDecimal amount =
                new BigDecimal(
                        amountMatcher.group(1)
                );

        String cardLast4 =
                cardMatcher.group(1);

        String merchant =
                cleanMerchant(
                        merchantMatcher.group(1)
                );

        LocalDate date =
                fallbackDate;

        if (dateMatcher.find()) {
            date =
                    LocalDate.parse(
                            dateMatcher.group(1),
                            DateTimeFormatter.ofPattern(
                                    "M/d/yyyy"
                            )
                    );
        }

        if (date == null) {
            throw new RuntimeException(
                    "Could not determine transaction date"
            );
        }

        LocalDateTime transactionTime =
                combineDateAndFallbackTime(
                        date,
                        fallbackTimestamp
                );

        return new GmailAlertResponse(
                null,
                merchant,
                amount,
                cardLast4,
                date,
                transactionTime,
                "WELLS_FARGO"
        );
    }

    private String cleanMerchant(
            String merchant
    ) {

        String cleaned =
                normalize(
                        merchant
                );

        int wellsAlertIndex =
                cleaned.toLowerCase(
                        Locale.ROOT
                ).indexOf(
                        "wells fargo alert"
                );

        if (wellsAlertIndex >= 0) {
            cleaned =
                    cleaned.substring(
                            0,
                            wellsAlertIndex
                    ).trim();
        }

        cleaned =
                cleaned.replaceAll(
                        "[,;:\\s]+$",
                        ""
                );

        if (cleaned.length() > 255) {
            cleaned =
                    cleaned.substring(
                            0,
                            255
                    );
        }

        return cleaned;
    }

    private GmailAlertResponse parseDiscoverAlert(
            String text,
            LocalDate fallbackDate,
            LocalDateTime fallbackTimestamp
    ) {

        Matcher cardMatcher =
                DISCOVER_CARD_PATTERN.matcher(
                        text
                );

        Matcher transactionMatcher =
                DISCOVER_TRANSACTION_PATTERN.matcher(
                        text
                );

        if (!cardMatcher.find()) {
            throw new RuntimeException(
                    "Could not parse card from Discover email"
            );
        }

        if (!transactionMatcher.find()) {
            throw new RuntimeException(
                    "Could not parse Discover transaction"
            );
        }

        String monthText =
                transactionMatcher.group(1);

        int day =
                Integer.parseInt(
                        transactionMatcher.group(2)
                );

        int year =
                Integer.parseInt(
                        transactionMatcher.group(3)
                );

        String merchant =
                transactionMatcher.group(4)
                        .trim();

        BigDecimal amount =
                new BigDecimal(
                        transactionMatcher.group(5)
                );

        String cardLast4 =
                cardMatcher.group(1);

        DateTimeFormatter monthFormatter =
                DateTimeFormatter.ofPattern(
                        "MMM",
                        Locale.ENGLISH
                );

        Month month =
                Month.from(
                        monthFormatter.parse(
                                monthText
                        )
                );

        LocalDate date =
                LocalDate.of(
                        year,
                        month,
                        day
                );

        if (date == null) {
            date = fallbackDate;
        }

        LocalDateTime transactionTime =
                combineDateAndFallbackTime(
                        date,
                        fallbackTimestamp
                );

        return new GmailAlertResponse(
                null,
                merchant,
                amount,
                cardLast4,
                date,
                transactionTime,
                "DISCOVER"
        );
    }

    private LocalDateTime combineDateAndFallbackTime(
            LocalDate date,
            LocalDateTime fallbackTimestamp
    ) {

        if (date == null
                || fallbackTimestamp == null) {
            return null;
        }

        return LocalDateTime.of(
                date,
                fallbackTimestamp.toLocalTime()
        );
    }

    private LocalDateTime dateTimeFromInternalTimestamp(
            String internalDate
    ) {

        if (internalDate == null
                || internalDate.isBlank()) {
            return null;
        }
         try {

            long milliseconds =
                    Long.parseLong(
                            internalDate
                    );

            return Instant
                    .ofEpochMilli(
                            milliseconds
                    )
                    .atZone(
                            TRANSACTION_ZONE
                    )
                    .toLocalDateTime();

        } catch (NumberFormatException exception) {
            return null;
        }
    }

    private String normalize(
            String text
    ) {

        if (text == null) {
            return "";
        }

        return text
                .replace('\u00A0', ' ')
                .replaceAll("\\s+", " ")
                .trim();
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
 @PostMapping("/sync")
 @Transactional
 public Map<String,Object> sync(@AuthenticationPrincipal Jwt jwt){
  // Account-scoped, idempotent sync. Only new Gmail message IDs affect the balance.
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
