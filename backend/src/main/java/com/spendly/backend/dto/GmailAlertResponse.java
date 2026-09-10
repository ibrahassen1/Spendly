package com.spendly.backend.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

public record GmailAlertResponse(
        String merchant,
        BigDecimal amount,
        String cardLast4,
        LocalDate date
) {
}
