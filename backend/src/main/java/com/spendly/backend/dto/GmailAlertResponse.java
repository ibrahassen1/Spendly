package com.spendly.backend.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

public record GmailAlertResponse(
        Long id,
        String merchant,
        BigDecimal amount,
        String cardLast4,
        LocalDate date,
        LocalDateTime transactionTime,
        String sourceBank
) {
}