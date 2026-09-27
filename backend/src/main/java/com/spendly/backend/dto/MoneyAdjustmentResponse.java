package com.spendly.backend.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

public record MoneyAdjustmentResponse(
        Long id,
        BigDecimal amount,
        LocalDate date,
        LocalDateTime createdAt
) {
}
