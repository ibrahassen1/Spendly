package com.spendly.backend.services;

import static org.junit.jupiter.api.Assertions.*;
import java.lang.reflect.Method;
import java.math.BigDecimal;
import java.time.LocalDate;
import org.junit.jupiter.api.Test;
import com.spendly.backend.dto.GmailAlertResponse;

/**
 * Baseline regression tests for the production Gmail parser.
 * This test deliberately exercises the existing parser without changing it.
 */
class GmailProductionParserTest {
    @Test
    void discoverAlertExtractsPurchaseFields() throws Exception {
        GmailService service = new GmailService("", "", "",
                null, null, null);
        Method parse = GmailService.class.getDeclaredMethod(
                "parseDiscoverAlert", String.class, LocalDate.class,
                java.time.LocalDateTime.class);
        parse.setAccessible(true);
        String email = "Card ending in 5793. On Oct 31, 2026, at Chick-fil-A, "
                + "a pending authorization or purchase in the amount of $20.44";
        GmailAlertResponse alert = (GmailAlertResponse) parse.invoke(
                service, email, LocalDate.of(2026, 10, 31), null);
        assertEquals("Chick-fil-A", alert.merchant());
        assertEquals(0, new BigDecimal("20.44").compareTo(alert.amount()));
        assertEquals(LocalDate.of(2026, 10, 31), alert.date());
        assertEquals("5793", alert.cardLast4());
    }
}
