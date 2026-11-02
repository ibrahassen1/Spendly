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

@RestController
@RequestMapping("/api/account/expenses")
public class AccountExpenseController {
    private final JdbcTemplate jdbc;
    public AccountExpenseController(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public record ExpenseRequest(String merchant, BigDecimal amount, LocalDate expenseDate) {}

    private String user(Jwt jwt) {
        if (jwt == null || jwt.getSubject() == null || jwt.getSubject().isBlank())
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        return jwt.getSubject();
    }

    @GetMapping
    public List<Map<String,Object>> list(@AuthenticationPrincipal Jwt jwt) {
        return jdbc.queryForList(
            "SELECT id,merchant,amount,expense_date AS \"expenseDate\" FROM user_expenses WHERE user_id=? ORDER BY expense_date DESC,id DESC",
            user(jwt));
    }

    @PostMapping
    @Transactional
    public Map<String,Object> add(@AuthenticationPrincipal Jwt jwt,@RequestBody ExpenseRequest request) {
        String id=user(jwt);
        if (request == null || request.merchant()==null || request.merchant().isBlank()
            || request.merchant().length()>200 || request.amount()==null || request.expenseDate()==null
            || request.amount().scale()>2 || request.amount().signum()<=0
            || request.amount().compareTo(new BigDecimal("9999999999.99"))>0
            || request.expenseDate().isAfter(LocalDate.now()))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Invalid expense");
        jdbc.query("SELECT pg_advisory_xact_lock(hashtext(?))",rs -> null,id);
        int updated=jdbc.update(
            "UPDATE user_safe_balances SET allocation=allocation-? WHERE user_id=?",
            request.amount(),id);
        if (updated==0) throw new ResponseStatusException(HttpStatus.CONFLICT,"Add a paycheck first");
        jdbc.update("INSERT INTO user_expenses(user_id,merchant,amount,expense_date) VALUES(?,?,?,?)",
            id,request.merchant().trim(),request.amount(),request.expenseDate());
        return Map.of("status","saved");
    }

    @DeleteMapping("/{expenseId}")
    @Transactional
    public Map<String,Object> delete(@AuthenticationPrincipal Jwt jwt,@PathVariable long expenseId) {
        String id=user(jwt);
        jdbc.query("SELECT pg_advisory_xact_lock(hashtext(?))",rs -> null,id);
        var found=jdbc.query(
            "SELECT amount FROM user_expenses WHERE id=? AND user_id=? FOR UPDATE",
            (rs,n)->rs.getBigDecimal(1),expenseId,id);
        if (found.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        jdbc.update("DELETE FROM user_expenses WHERE id=? AND user_id=?",expenseId,id);
        jdbc.update("UPDATE user_safe_balances SET allocation=allocation+? WHERE user_id=?",found.get(0),id);
        return Map.of("status","deleted");
    }
}
