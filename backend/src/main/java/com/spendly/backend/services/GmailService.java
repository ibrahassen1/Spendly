package com.spendly.backend.services;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.spendly.backend.dto.GmailAlertResponse;
import com.spendly.backend.dto.GmailRefreshResponse;
import com.spendly.backend.models.EmailAlertTransaction;
import com.spendly.backend.models.GmailCredential;
import com.spendly.backend.repositories.EmailAlertTransactionRepository;
import com.spendly.backend.repositories.GmailCredentialRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.util.UriComponentsBuilder;

import java.io.IOException;
import java.math.BigDecimal;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class GmailService {

    private static final String GMAIL_READONLY_SCOPE =
            "https://www.googleapis.com/auth/gmail.readonly";

    private static final ZoneId TRANSACTION_ZONE =
            ZoneId.of("America/New_York");

    private static final Pattern AMOUNT_PATTERN =
            Pattern.compile(
                    "(?:purchase(?:\\s+amount)?(?:\\s+of)?|amount:)\\s*\\$([0-9]+(?:\\.[0-9]{1,2})?)",
                    Pattern.CASE_INSENSITIVE
            );

    private static final Pattern CARD_PATTERN =
            Pattern.compile(
                    "(?:card(?:\\s+number)?[^0-9]{0,30})(?:\\.\\.\\.|\\*+)?([0-9]{4})",
                    Pattern.CASE_INSENSITIVE
            );

    private static final Pattern MERCHANT_PATTERN =
            Pattern.compile(
                    "Merchant\\s*:\\s*(.+?)(?:\\s+Date\\s*:|$)",
                    Pattern.CASE_INSENSITIVE
            );

    private static final Pattern DATE_PATTERN =
            Pattern.compile(
                    "Date\\s*:\\s*(\\d{1,2}/\\d{1,2}/\\d{4})",
                    Pattern.CASE_INSENSITIVE
            );

    private final String clientId;
    private final String clientSecret;
    private final String redirectUri;

    private final EmailAlertTransactionRepository emailAlertTransactionRepository;
    private final GmailCredentialRepository gmailCredentialRepository;

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final HttpClient httpClient = HttpClient.newHttpClient();

    private String expectedState;

    public GmailService(
            @Value("${google.client-id}") String clientId,
            @Value("${google.client-secret}") String clientSecret,
            @Value("${google.redirect-uri}") String redirectUri,
            EmailAlertTransactionRepository emailAlertTransactionRepository,
            GmailCredentialRepository gmailCredentialRepository
    ) {
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.redirectUri = redirectUri;
        this.emailAlertTransactionRepository = emailAlertTransactionRepository;
        this.gmailCredentialRepository = gmailCredentialRepository;
    }

    public String createAuthorizationUrl() {
        expectedState = UUID.randomUUID().toString();

        return UriComponentsBuilder
                .fromUriString("https://accounts.google.com/o/oauth2/v2/auth")
                .queryParam("client_id", clientId)
                .queryParam("redirect_uri", redirectUri)
                .queryParam("response_type", "code")
                .queryParam("scope", GMAIL_READONLY_SCOPE)
                .queryParam("access_type", "offline")
                .queryParam("prompt", "consent")
                .queryParam("state", expectedState)
                .build()
                .encode()
                .toUriString();
    }

    public void exchangeAuthorizationCode(
            String code,
            String state
    ) throws IOException, InterruptedException {

        if (expectedState == null
                || state == null
                || !expectedState.equals(state)) {
            throw new IllegalArgumentException(
                    "Invalid Google OAuth state"
            );
        }

        String requestBody =
                "code=" + encode(code)
                        + "&client_id=" + encode(clientId)
                        + "&client_secret=" + encode(clientSecret)
                        + "&redirect_uri=" + encode(redirectUri)
                        + "&grant_type=authorization_code";

        HttpRequest request =
                HttpRequest.newBuilder()
                        .uri(URI.create(
                                "https://oauth2.googleapis.com/token"
                        ))
                        .header(
                                "Content-Type",
                                "application/x-www-form-urlencoded"
                        )
                        .POST(
                                HttpRequest.BodyPublishers.ofString(
                                        requestBody
                                )
                        )
                        .build();

        HttpResponse<String> response =
                httpClient.send(
                        request,
                        HttpResponse.BodyHandlers.ofString()
                );

        ensureSuccessful(
                response,
                "Google token exchange failed"
        );

        JsonNode body =
                objectMapper.readTree(response.body());

        String refreshToken =
                body.path("refresh_token").asText("");

        if (!refreshToken.isBlank()) {
            saveRefreshToken(refreshToken);
        } else if (gmailCredentialRepository
                .findTopByOrderByIdDesc()
                .isEmpty()) {
            throw new RuntimeException(
                    "Google did not return a refresh token"
            );
        }
    }

    public GmailRefreshResponse refreshWellsFargoAlerts()
            throws IOException, InterruptedException {

        String accessToken = getFreshAccessToken();

        String query =
                "from:alerts@notify.wellsfargo.com newer_than:30d";

        String searchUrl =
                "https://gmail.googleapis.com/gmail/v1/users/me/messages"
                        + "?maxResults=100&q="
                        + URLEncoder.encode(
                                query,
                                StandardCharsets.UTF_8
                        );

        HttpResponse<String> searchResponse =
                httpClient.send(
                        authenticatedGet(
                                searchUrl,
                                accessToken
                        ),
                        HttpResponse.BodyHandlers.ofString()
                );

        ensureSuccessful(
                searchResponse,
                "Gmail message search failed"
        );

        JsonNode searchBody =
                objectMapper.readTree(
                        searchResponse.body()
                );

        JsonNode messages =
                searchBody.path("messages");

        if (!messages.isArray() || messages.isEmpty()) {
            return new GmailRefreshResponse(
                    0,
                    BigDecimal.ZERO,
                    List.of()
            );
        }

        List<GmailAlertResponse> newTransactions =
                new ArrayList<>();

        BigDecimal totalReduced =
                BigDecimal.ZERO;

        for (JsonNode messageNode : messages) {

            String messageId =
                    messageNode
                            .path("id")
                            .asText();

            Optional<EmailAlertTransaction> existingTransaction =
                    emailAlertTransactionRepository
                            .findByGmailMessageId(messageId);

            if (existingTransaction.isPresent()) {
                backfillTransactionTimeIfNeeded(
                        existingTransaction.get(),
                        messageId,
                        accessToken
                );
                continue;
            }

            try {
                GmailAlertResponse alert =
                        fetchAndParseMessage(
                                messageId,
                                accessToken
                        );

                saveAlert(
                        messageId,
                        alert
                );

                newTransactions.add(alert);

                totalReduced =
                        totalReduced.add(
                                alert.amount()
                        );

            } catch (RuntimeException exception) {
                // Ignore Wells Fargo emails that are not
                // purchase alerts we know how to parse.
            }
        }

        return new GmailRefreshResponse(
                newTransactions.size(),
                totalReduced,
                newTransactions
        );
    }

    private void backfillTransactionTimeIfNeeded(
            EmailAlertTransaction transaction,
            String messageId,
            String accessToken
    ) throws IOException, InterruptedException {

        if (transaction.getTransactionTime() != null) {
            return;
        }

        try {
            GmailAlertResponse alert =
                    fetchAndParseMessage(
                            messageId,
                            accessToken
                    );

            transaction.setTransactionTime(
                    alert.transactionTime()
            );

            emailAlertTransactionRepository.save(
                    transaction
            );

        } catch (RuntimeException exception) {
            // Leave the timestamp empty if the email
            // cannot be parsed safely.
        }
    }

    private GmailAlertResponse fetchAndParseMessage(
            String messageId,
            String accessToken
    ) throws IOException, InterruptedException {

        String messageUrl =
                "https://gmail.googleapis.com/gmail/v1/users/me/messages/"
                        + messageId
                        + "?format=full";

        HttpResponse<String> messageResponse =
                httpClient.send(
                        authenticatedGet(
                                messageUrl,
                                accessToken
                        ),
                        HttpResponse.BodyHandlers.ofString()
                );

        ensureSuccessful(
                messageResponse,
                "Gmail message retrieval failed"
        );

        JsonNode message =
                objectMapper.readTree(
                        messageResponse.body()
                );

        String snippet =
                normalize(
                        message.path("snippet")
                                .asText("")
                );

        LocalDateTime fallbackTimestamp =
                dateTimeFromInternalTimestamp(
                        message.path("internalDate")
                                .asText("")
                );

        LocalDate fallbackDate =
                fallbackTimestamp == null
                        ? null
                        : fallbackTimestamp.toLocalDate();

        return parseWellsFargoAlert(
                snippet,
                fallbackDate,
                fallbackTimestamp
        );
    }

    private String getFreshAccessToken()
            throws IOException, InterruptedException {

        GmailCredential credential =
                gmailCredentialRepository
                        .findTopByOrderByIdDesc()
                        .orElseThrow(
                                () -> new RuntimeException(
                                        "Gmail is not connected. Visit /api/gmail/oauth/start once."
                                )
                        );

        String requestBody =
                "client_id=" + encode(clientId)
                        + "&client_secret=" + encode(clientSecret)
                        + "&refresh_token="
                        + encode(credential.getRefreshToken())
                        + "&grant_type=refresh_token";

        HttpRequest request =
                HttpRequest.newBuilder()
                        .uri(URI.create(
                                "https://oauth2.googleapis.com/token"
                        ))
                        .header(
                                "Content-Type",
                                "application/x-www-form-urlencoded"
                        )
                        .POST(
                                HttpRequest.BodyPublishers.ofString(
                                        requestBody
                                )
                        )
                        .build();

        HttpResponse<String> response =
                httpClient.send(
                        request,
                        HttpResponse.BodyHandlers.ofString()
                );

        ensureSuccessful(
                response,
                "Google access token refresh failed"
        );

        JsonNode body =
                objectMapper.readTree(
                        response.body()
                );

        String accessToken =
                body.path("access_token")
                        .asText("");

        if (accessToken.isBlank()) {
            throw new RuntimeException(
                    "Google did not return an access token"
            );
        }

        return accessToken;
    }

    private void saveRefreshToken(
            String refreshToken
    ) {
        GmailCredential credential =
                gmailCredentialRepository
                        .findTopByOrderByIdDesc()
                        .orElseGet(
                                GmailCredential::new
                        );

        credential.setRefreshToken(
                refreshToken
        );

        gmailCredentialRepository.save(
                credential
        );
    }

    private void saveAlert(
            String messageId,
            GmailAlertResponse alert
    ) {
        if (emailAlertTransactionRepository
                .findByGmailMessageId(messageId)
                .isPresent()) {
            return;
        }

        EmailAlertTransaction transaction =
                new EmailAlertTransaction();

        transaction.setGmailMessageId(messageId);
        transaction.setMerchant(alert.merchant());
        transaction.setAmount(alert.amount());
        transaction.setCardLast4(alert.cardLast4());
        transaction.setTransactionDate(alert.date());
        transaction.setTransactionTime(alert.transactionTime());
        transaction.setStatus("TEMPORARY");

        emailAlertTransactionRepository.save(
                transaction
        );
    }

    private GmailAlertResponse parseWellsFargoAlert(
            String text,
            LocalDate fallbackDate,
            LocalDateTime fallbackTimestamp
    ) {
        Matcher amountMatcher =
                AMOUNT_PATTERN.matcher(text);

        Matcher cardMatcher =
                CARD_PATTERN.matcher(text);

        Matcher merchantMatcher =
                MERCHANT_PATTERN.matcher(text);

        Matcher dateMatcher =
                DATE_PATTERN.matcher(text);

        if (!amountMatcher.find()) {
            throw new RuntimeException(
                    "Could not parse amount from Wells Fargo email"
            );
        }

        if (!cardMatcher.find()) {
            throw new RuntimeException(
                    "Could not parse card number from Wells Fargo email"
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
                merchantMatcher.group(1)
                        .trim();

        LocalDate date = fallbackDate;

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

        LocalDateTime transactionTime = null;

        if (fallbackTimestamp != null) {
            transactionTime =
                    LocalDateTime.of(
                            date,
                            fallbackTimestamp.toLocalTime()
                    );
        }

        return new GmailAlertResponse(
                merchant,
                amount,
                cardLast4,
                date,
                transactionTime
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
                    Long.parseLong(internalDate);

            return Instant
                    .ofEpochMilli(milliseconds)
                    .atZone(TRANSACTION_ZONE)
                    .toLocalDateTime();

        } catch (NumberFormatException exception) {
            return null;
        }
    }

    private String normalize(
            String text
    ) {
        return text
                .replace('\u00A0', ' ')
                .replaceAll("\\s+", " ")
                .trim();
    }

    private HttpRequest authenticatedGet(
            String url,
            String accessToken
    ) {
        return HttpRequest.newBuilder()
                .uri(URI.create(url))
                .header(
                        "Authorization",
                        "Bearer " + accessToken
                )
                .GET()
                .build();
    }

    private void ensureSuccessful(
            HttpResponse<String> response,
            String message
    ) {
        if (response.statusCode() < 200
                || response.statusCode() >= 300) {

            throw new RuntimeException(
                    message
                            + ": "
                            + response.body()
            );
        }
    }

    private String encode(
            String value
    ) {
        return URLEncoder.encode(
                value,
                StandardCharsets.UTF_8
        );
    }
}
