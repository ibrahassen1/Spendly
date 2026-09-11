package com.spendly.backend.controllers;

import com.spendly.backend.dto.GmailAlertResponse;
import com.spendly.backend.dto.GmailRefreshResponse;
import com.spendly.backend.repositories.EmailAlertTransactionRepository;
import com.spendly.backend.services.GmailService;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.util.List;

@RestController
@RequestMapping("/api/gmail")
@CrossOrigin(origins = {
        "http://localhost:5173",
        "https://spendly-two-beige.vercel.app"
})
public class GmailController {

    private final GmailService gmailService;
    private final EmailAlertTransactionRepository emailAlertTransactionRepository;

    public GmailController(
            GmailService gmailService,
            EmailAlertTransactionRepository emailAlertTransactionRepository
    ) {
        this.gmailService = gmailService;
        this.emailAlertTransactionRepository = emailAlertTransactionRepository;
    }

    @GetMapping("/oauth/start")
    public ResponseEntity<Void> startOAuth() {
        String authorizationUrl =
                gmailService.createAuthorizationUrl();

        return ResponseEntity
                .status(302)
                .header(
                        HttpHeaders.LOCATION,
                        authorizationUrl
                )
                .build();
    }

    @GetMapping("/oauth/callback")
    public ResponseEntity<String> oauthCallback(
            @RequestParam String code,
            @RequestParam String state
    ) throws IOException, InterruptedException {

        gmailService.exchangeAuthorizationCode(
                code,
                state
        );

        return ResponseEntity.ok(
                "Gmail connected to Spendly successfully. You can close this tab."
        );
    }

    @PostMapping("/refresh")
    public ResponseEntity<GmailRefreshResponse> refresh()
            throws IOException, InterruptedException {

        return ResponseEntity.ok(
                gmailService.refreshWellsFargoAlerts()
        );
    }

    @GetMapping("/recent")
    public ResponseEntity<List<GmailAlertResponse>> recentTransactions() {

        List<GmailAlertResponse> recent =
                emailAlertTransactionRepository
                        .findTop5ByOrderByCreatedAtDesc()
                        .stream()
                        .map(
                                transaction ->
                                        new GmailAlertResponse(
                                                transaction.getMerchant(),
                                                transaction.getAmount(),
                                                transaction.getCardLast4(),
                                                transaction.getTransactionDate()
                                        )
                        )
                        .toList();

        return ResponseEntity.ok(recent);
    }
}
