package com.spendly.backend.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

public record SafeToSpendResponse(
        BigDecimal allocation,
        BigDecimal countedSpending,
        BigDecimal safeToSpend,
        LocalDate startDate
) {
}
