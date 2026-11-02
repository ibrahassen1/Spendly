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
 * Gmail transactions are excluded until account-scoped Gmail OAuth is implemented.
 */
@RestController
@RequestMapping("/api/account/safe-to-spend")
public class AccountSafeToSpendController {
    private final JdbcTemplate jdbc;
    public AccountSafeToSpendController(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public record PaycheckRequest(String periodId, BigDecimal paycheck, BigDecimal safeCredit, LocalDate paycheckDate) {}
    public record Balance(BigDecimal allocation, LocalDate startDate) {}

    private String user(Jwt jwt) {
        if (jwt == null || jwt.getSubject() == null || jwt.getSubject().isBlank())
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        return jwt.getSubject();
    }
    private Balance balance(String user) {
        return jdbc.query("SELECT allocation,start_date FROM user_safe_balances WHERE user_id=?",
            (rs,n) -> new Balance(rs.getBigDecimal(1),rs.getDate(2).toLocalDate()),user)
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
