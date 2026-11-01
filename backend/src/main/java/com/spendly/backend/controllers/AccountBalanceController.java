package com.spendly.backend.controllers;

import com.spendly.backend.dto.AllocationRequest;
import com.spendly.backend.dto.SafeToSpendResponse;
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

/** Account-only endpoints; legacy shared-account endpoints remain blocked. */
@RestController
@RequestMapping("/api/account")
public class AccountBalanceController {
    private final JdbcTemplate db;
    public AccountBalanceController(JdbcTemplate db) { this.db = db; }

    private record Balance(BigDecimal amount, LocalDate startDate) {}
    private Balance balance(String user) {
        return db.query("SELECT allocation,start_date FROM account_safe_balances WHERE user_id=?",
                (rs,i) -> new Balance(rs.getBigDecimal(1),rs.getDate(2).toLocalDate()),user)
            .stream().findFirst().orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND,"Set an opening balance first"));
    }
    private SafeToSpendResponse response(String user) {
        Balance b = balance(user);
        BigDecimal spent = db.queryForObject(
            "SELECT COALESCE(SUM(amount),0) FROM account_gmail_transactions WHERE user_id=? AND status='TEMPORARY' AND transaction_date>=?",
            BigDecimal.class,user,b.startDate());
        return new SafeToSpendResponse(b.amount(),spent,b.amount().subtract(spent),b.startDate());
    }
    @GetMapping("/balance")
    public SafeToSpendResponse get(@AuthenticationPrincipal Jwt jwt) {
        return response(jwt.getSubject());
    }
    @PostMapping("/balance")
    @Transactional
    public SafeToSpendResponse set(@AuthenticationPrincipal Jwt jwt,@RequestBody AllocationRequest request) {
        if(request==null || request.amount()==null || request.startDate()==null
                || request.amount().signum()<0 || request.amount().scale()>2
                || request.startDate().isAfter(LocalDate.now()))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Invalid opening balance");
        int rows=db.update("INSERT INTO account_safe_balances(user_id,allocation,start_date) VALUES(?,?,?) ON CONFLICT DO NOTHING",
                jwt.getSubject(),request.amount(),request.startDate());
        if(rows==0) throw new ResponseStatusException(HttpStatus.CONFLICT,"Opening balance already exists");
        return response(jwt.getSubject());
    }
    @GetMapping("/transactions")
    public List<Map<String,Object>> transactions(@AuthenticationPrincipal Jwt jwt) {
        return db.queryForList("SELECT id,merchant,amount,transaction_date AS \"date\",transaction_time AS \"transactionTime\",card_last4 AS \"cardLast4\",source_bank AS \"sourceBank\" FROM account_gmail_transactions WHERE user_id=? AND status='TEMPORARY' ORDER BY transaction_date DESC,id DESC",jwt.getSubject());
    }
    @GetMapping("/tracking-date")
    public Map<String,String> trackingDate(@AuthenticationPrincipal Jwt jwt) {
        Balance b=balance(jwt.getSubject());
        LocalDate date=db.query("SELECT tracking_start_date FROM account_gmail_tracking_settings WHERE user_id=?",
                (rs,i)->rs.getDate(1).toLocalDate(),jwt.getSubject()).stream().findFirst().orElse(b.startDate());
        return Map.of("startDate",date.toString());
    }
    @PatchMapping("/tracking-date")
    public Map<String,String> trackingDate(@AuthenticationPrincipal Jwt jwt,@RequestBody Map<String,String> body) {
        LocalDate date;
        try { date=LocalDate.parse(body.get("startDate")); }
        catch(Exception e) {throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Invalid date");}
        if(date.isAfter(LocalDate.now()) || date.isBefore(LocalDate.now().minusYears(2)))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Date must be within the last two years");
        balance(jwt.getSubject());
        db.update("INSERT INTO account_gmail_tracking_settings(user_id,tracking_start_date) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET tracking_start_date=EXCLUDED.tracking_start_date",
                jwt.getSubject(),date);
        return Map.of("startDate",date.toString());
    }
}
