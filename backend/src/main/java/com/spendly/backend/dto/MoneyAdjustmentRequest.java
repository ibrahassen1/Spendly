package com.spendly.backend.dto;

import java.math.BigDecimal;

public record MoneyAdjustmentRequest(
        BigDecimal amount
) {
}
