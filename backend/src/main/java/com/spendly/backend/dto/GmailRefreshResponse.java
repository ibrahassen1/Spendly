package com.spendly.backend.dto;

import java.math.BigDecimal;
import java.util.List;

public record GmailRefreshResponse(
        int newTransactionCount,
        BigDecimal totalReduced,
        List<GmailAlertResponse> newTransactions
) {}
