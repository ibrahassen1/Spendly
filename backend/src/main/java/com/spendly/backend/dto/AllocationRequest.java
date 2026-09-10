package com.spendly.backend.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

public record AllocationRequest(
        BigDecimal amount,
        LocalDate startDate
) {
}
