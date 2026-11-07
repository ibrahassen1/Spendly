package com.spendly.backend.controllers;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.spendly.backend.services.GmailService;
import java.math.BigDecimal;
import java.sql.Date;
import java.sql.ResultSet;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.server.ResponseStatusException;

/**
 * Regression tests for account ownership. These do not require Gmail access,
 * production credentials, or a production database.
 */
class AccountIsolationTests {
    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final Jwt alice = Jwt.withTokenValue("test-alice")
            .header("alg", "none").subject("clerk-alice").build();
    private final Jwt bob = Jwt.withTokenValue("test-bob")
            .header("alg", "none").subject("clerk-bob").build();

    private AccountGmailController gmailController() {
        return new AccountGmailController(
                jdbc, mock(GmailService.class), "test-client", "test-secret",
                "http://localhost/callback", "");
    }

    @Test
    void transactionListFiltersOnAuthenticatedClerkUser() {
        when(jdbc.queryForList(anyString(), eq("clerk-alice"))).thenReturn(List.of());
        gmailController().transactions(alice);
        verify(jdbc).queryForList(
                argThat(sql -> sql.contains("FROM user_email_alert_transactions")
                        && sql.contains("WHERE user_id=?")),
                eq("clerk-alice"));
    }

    @Test
    void deletionAndRestorationCannotChangeAnotherUsersTransaction() {
        when(jdbc.update(anyString(), eq(17L), eq("clerk-alice"))).thenReturn(0);
        AccountGmailController controller = gmailController();

        ResponseStatusException deleteFailure = assertThrows(
                ResponseStatusException.class,
                () -> controller.deleteTransaction(alice, 17L));
        assertEquals(HttpStatus.NOT_FOUND, deleteFailure.getStatusCode());

        ResponseStatusException restoreFailure = assertThrows(
                ResponseStatusException.class,
                () -> controller.restoreTransaction(alice, 17L));
        assertEquals(HttpStatus.NOT_FOUND, restoreFailure.getStatusCode());

        verify(jdbc).update(
                argThat(sql -> sql.contains("SET status='DELETED'")
                        && sql.contains("WHERE id=? AND user_id=?")),
                eq(17L), eq("clerk-alice"));
        verify(jdbc).update(
                argThat(sql -> sql.contains("SET status='TEMPORARY'")
                        && sql.contains("WHERE id=? AND user_id=?")),
                eq(17L), eq("clerk-alice"));
    }

    @Test
    @SuppressWarnings("unchecked")
    void balanceUsesOnlyAuthenticatedUsersAllocationAndTemporarySpending() throws Exception {
        when(jdbc.query(anyString(), any(RowMapper.class), eq("clerk-bob")))
                .thenAnswer(invocation -> {
                    RowMapper<AccountSafeToSpendController.Balance> mapper =
                            invocation.getArgument(1);
                    ResultSet rs = mock(ResultSet.class);
                    when(rs.getBigDecimal(1)).thenReturn(new BigDecimal("500.00"));
                    when(rs.getBigDecimal(3)).thenReturn(new BigDecimal("60.00"));
                    when(rs.getDate(2)).thenReturn(Date.valueOf(LocalDate.of(2026, 11, 1)));
                    return List.of(mapper.mapRow(rs, 0));
                });

        var actual = new AccountSafeToSpendController(jdbc).get(bob);
        assertEquals(new BigDecimal("440.00"), actual.safeToSpend());
        assertEquals(new BigDecimal("60.00"), actual.countedSpending());
        verify(jdbc).query(
                argThat(sql -> sql.contains("t.user_id=b.user_id")
                        && sql.contains("t.transaction_date>=b.start_date")
                        && sql.contains("UPPER(t.status)='TEMPORARY'")
                        && sql.contains("WHERE b.user_id=?")),
                any(RowMapper.class), eq("clerk-bob"));
    }
    @Test
    void adjustmentHistoryOnlyReadsTheSignedInUsersRows() {
        when(jdbc.queryForList(anyString(), eq("clerk-bob"))).thenReturn(List.of());
        new AccountSafeToSpendController(jdbc).adjustments(bob);
        verify(jdbc).queryForList(
                argThat(sql -> sql.contains("FROM user_money_adjustments")
                        && sql.contains("WHERE user_id=?")),
                eq("clerk-bob"));
    }

    @Test
    @SuppressWarnings("unchecked")
    void duplicateAdjustmentIsIdempotentForTheSameUser() {
        when(jdbc.query(
                argThat(sql -> sql.contains("SELECT amount FROM user_money_adjustments")),
                any(RowMapper.class), eq("clerk-alice"), eq("once")))
                .thenReturn(List.of(new BigDecimal("20.00")));

        when(jdbc.query(
                argThat(sql -> sql.contains("FROM user_safe_balances b WHERE b.user_id=?")),
                any(RowMapper.class), eq("clerk-alice")))
                .thenReturn(List.of(new AccountSafeToSpendController.Balance(
                        new BigDecimal("220.00"), BigDecimal.ZERO,
                        new BigDecimal("220.00"), LocalDate.of(2026, 11, 1))));

        var result = new AccountSafeToSpendController(jdbc).adjust(
                alice, new AccountSafeToSpendController.AdjustmentRequest(
                        "once", new BigDecimal("20.00")));

        assertEquals(new BigDecimal("220.00"), result.safeToSpend());
        verify(jdbc, never()).update(anyString(), any(Object[].class));
    }

    @Test
    void invalidAdjustmentIsRejectedWithoutDatabaseWrites() {
        var controller = new AccountSafeToSpendController(jdbc);
        var error = assertThrows(ResponseStatusException.class, () ->
                controller.adjust(alice, new AccountSafeToSpendController.AdjustmentRequest(
                        "invalid", BigDecimal.ZERO)));
        assertEquals(HttpStatus.BAD_REQUEST, error.getStatusCode());
        verify(jdbc, never()).update(anyString(), any(Object[].class));
    }

}
