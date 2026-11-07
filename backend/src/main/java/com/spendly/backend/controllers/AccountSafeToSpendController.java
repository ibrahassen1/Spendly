package com.spendly.backend.controllers;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

/**
 * Account-scoped ledger. Never reads or writes legacy shared financial tables.
 * Account-scoped Gmail spending is deducted using the original Safe-to-Spend formula.
 */
@RestController
@RequestMapping("/api/account/safe-to-spend")
public class AccountSafeToSpendController {
    private final JdbcTemplate jdbc;
    public AccountSafeToSpendController(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public record PaycheckRequest(String periodId, BigDecimal paycheck, BigDecimal safeCredit, LocalDate paycheckDate) {}
    public record Balance(BigDecimal allocation, BigDecimal countedSpending, BigDecimal safeToSpend, LocalDate startDate) {}

    private String user(Jwt jwt) {
        if (jwt == null || jwt.getSubject() == null || jwt.getSubject().isBlank())
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        return jwt.getSubject();
    }
    private Balance balance(String user) {
        return jdbc.query("SELECT b.allocation, b.start_date, COALESCE((" +
            "SELECT SUM(t.amount) FROM user_email_alert_transactions t " +
            "WHERE t.user_id=b.user_id AND t.transaction_date>=b.start_date " +
            "AND UPPER(t.status)='TEMPORARY'),0) AS counted_spending " +
            "FROM user_safe_balances b WHERE b.user_id=?",
            (rs,n) -> { BigDecimal allocation=rs.getBigDecimal(1);
                BigDecimal spent=rs.getBigDecimal(3);
                return new Balance(allocation,spent,allocation.subtract(spent),rs.getDate(2).toLocalDate()); },user)
            .stream().findFirst().orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND,"No paycheck submitted"));
    }

    @GetMapping
    public Balance get(@AuthenticationPrincipal Jwt jwt) { return balance(user(jwt)); }

    @GetMapping("/paychecks")
    public List<Map<String,Object>> history(@AuthenticationPrincipal Jwt jwt) {
        return jdbc.queryForList(
            "SELECT period_id AS \"periodId\",paycheck,safe_credit AS \"safeCredit\",paycheck_date AS \"paycheckDate\",submitted_at AS \"creditedAt\" FROM user_paycheck_credits WHERE user_id=? ORDER BY submitted_at DESC",
            user(jwt));
    }

    public record AdjustmentRequest(String requestId, BigDecimal amount) {}

    @GetMapping("/adjustments")
    public List<Map<String,Object>> adjustments(@AuthenticationPrincipal Jwt jwt) {
        return jdbc.queryForList(
            "SELECT id,amount,created_at AS \"createdAt\" FROM user_money_adjustments " +
            "WHERE user_id=? ORDER BY created_at DESC,id DESC LIMIT 100",
            user(jwt));
    }

    @PostMapping("/adjustments")
    @Transactional
    public Balance adjust(@AuthenticationPrincipal Jwt jwt, @RequestBody AdjustmentRequest request) {
        String id=user(jwt);
        if (request==null || request.requestId()==null
            || !request.requestId().matches("[A-Za-z0-9_-]{1,100}")
            || request.amount()==null || request.amount().scale()>2
            || request.amount().signum()==0
            || request.amount().abs().compareTo(new BigDecimal("9999999999.99"))>0)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Invalid adjustment");

        // One adjustment per requestId. The per-account lock also prevents lost updates.
        jdbc.query("SELECT pg_advisory_xact_lock(hashtext(?))", rs -> null, id);
        List<BigDecimal> existing=jdbc.query(
            "SELECT amount FROM user_money_adjustments WHERE user_id=? AND request_id=?",
            (rs,n)->rs.getBigDecimal(1),id,request.requestId());
        if (!existing.isEmpty()) {
            if (existing.get(0).compareTo(request.amount())!=0)
                throw new ResponseStatusException(HttpStatus.CONFLICT,"Adjustment already submitted with a different amount");
            return balance(id);
        }

        List<BigDecimal> current=jdbc.query(
            "SELECT allocation FROM user_safe_balances WHERE user_id=? FOR UPDATE",
            (rs,n)->rs.getBigDecimal(1),id);
        if (current.isEmpty())
            throw new ResponseStatusException(HttpStatus.CONFLICT,"Submit a paycheck first");

        BigDecimal updated=current.get(0).add(request.amount());
        if (updated.abs().compareTo(new BigDecimal("9999999999.99"))>0)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Adjustment exceeds supported balance");
        jdbc.update("INSERT INTO user_money_adjustments(user_id,request_id,amount) VALUES(?,?,?)",
            id,request.requestId(),request.amount());
        jdbc.update("UPDATE user_safe_balances SET allocation=? WHERE user_id=?",updated,id);
        return balance(id);
    }

    @PostMapping("/paychecks")
    @Transactional
    public Balance credit(@AuthenticationPrincipal Jwt jwt,@RequestBody PaycheckRequest request) {
        String id=user(jwt);
        if (request == null || request.periodId()==null || !request.periodId().matches("[A-Za-z0-9_-]{1,100}")
            || request.paycheck()==null || request.safeCredit()==null || request.paycheckDate()==null
            || request.paycheck().scale()>2 || request.safeCredit().scale()>2
            || request.paycheck().signum()<=0 || request.safeCredit().signum()<0
            || request.safeCredit().compareTo(request.paycheck())>0
            || request.paycheck().compareTo(new BigDecimal("9999999999.99"))>0
            || request.paycheckDate().isAfter(LocalDate.now()))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Invalid paycheck");

        // Serialize concurrent credits per authenticated account, including initial insert.
        jdbc.query("SELECT pg_advisory_xact_lock(hashtext(?))", rs -> null, id);
        var prior=jdbc.query(
            "SELECT paycheck,safe_credit,paycheck_date FROM user_paycheck_credits WHERE user_id=? AND period_id=?",
            (rs,n)->new Object[]{rs.getBigDecimal(1),rs.getBigDecimal(2),rs.getDate(3).toLocalDate()},
            id,request.periodId());
        if (!prior.isEmpty()) {
            Object[] p=prior.get(0);
            if (((BigDecimal)p[0]).compareTo(request.paycheck())!=0
                || ((BigDecimal)p[1]).compareTo(request.safeCredit())!=0
                || !p[2].equals(request.paycheckDate()))
                throw new ResponseStatusException(HttpStatus.CONFLICT,"Paycheck already submitted with different values");
            return balance(id);
        }
        jdbc.update("INSERT INTO user_safe_balances(user_id,allocation,start_date) VALUES(?,?,?) ON CONFLICT(user_id) DO NOTHING",
            id,BigDecimal.ZERO,request.paycheckDate());
        jdbc.update("INSERT INTO user_paycheck_credits(user_id,period_id,paycheck,safe_credit,paycheck_date) VALUES(?,?,?,?,?)",
            id,request.periodId(),request.paycheck(),request.safeCredit(),request.paycheckDate());
        jdbc.update("UPDATE user_safe_balances SET allocation=allocation+? WHERE user_id=?",
            request.safeCredit(),id);
        return balance(id);
    }
}
