package com.spendly.backend.controllers;

import com.spendly.backend.services.PlaidService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.util.Map;

@RestController
@RequestMapping("/api/plaid")
@CrossOrigin(origins = "http://localhost:5173")
public class PlaidController {

    private final PlaidService plaidService;

    public PlaidController(PlaidService plaidService) {
        this.plaidService = plaidService;
    }

    @PostMapping("/link-token")
    public ResponseEntity<Map<String, String>> createLinkToken()
            throws IOException {

        String linkToken = plaidService.createLinkToken();

        return ResponseEntity.ok(
                Map.of("link_token", linkToken)
        );
    }

    @PostMapping("/exchange-token")
    public ResponseEntity<Map<String, String>> exchangeToken(
            @RequestBody Map<String, String> body
    ) throws IOException {

        String publicToken = body.get("public_token");

        if (publicToken == null || publicToken.isBlank()) {
            return ResponseEntity.badRequest().body(
                    Map.of("error", "public_token is required")
            );
        }

        plaidService.exchangePublicToken(publicToken);

        return ResponseEntity.ok(
                Map.of("message", "Plaid account connected successfully")
        );
    }
}
