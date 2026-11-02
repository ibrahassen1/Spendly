package com.spendly.backend.controllers;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

/** Per-account staging dashboard and goals data; never accesses legacy shared records. */
@RestController
@RequestMapping("/api/account")
public class AccountPlannerController {
    private final JdbcTemplate db;
    private final ObjectMapper json;
    public AccountPlannerController(JdbcTemplate db, ObjectMapper json) { this.db=db; this.json=json; }

    @GetMapping("/planner")
    public JsonNode planner(@AuthenticationPrincipal Jwt jwt) throws Exception {
        String raw=db.query("SELECT planner_json FROM account_planners WHERE user_id=?",
            (rs,i)->rs.getString(1),jwt.getSubject()).stream().findFirst().orElse(null);
        return raw==null ? null : json.readTree(raw);
    }

    @PutMapping("/planner")
    @Transactional
    public JsonNode savePlanner(@AuthenticationPrincipal Jwt jwt,@RequestBody JsonNode planner) throws Exception {
        if(!planner.isObject() || !planner.path("categories").isArray() ||
           !planner.path("periods").isArray() || !planner.path("goals").isObject())
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Invalid planner");
        String raw=json.writeValueAsString(planner);
        if(raw.length()>250000) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Planner too large");
        db.update("INSERT INTO account_planners(user_id,planner_json) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET planner_json=EXCLUDED.planner_json,updated_at=CURRENT_TIMESTAMP",
            jwt.getSubject(),raw);
        return planner;
    }

    public record PaycheckRequest(String periodId,BigDecimal paycheck,BigDecimal safeCredit,LocalDate paycheckDate) {}

    @PostMapping("/paychecks")
    @Transactional
    public Map<String,Object> credit(@AuthenticationPrincipal Jwt jwt,@RequestBody PaycheckRequest req) {
        if(req==null || req.periodId()==null || req.periodId().isBlank() || req.periodId().length()>255 ||
           req.paycheck()==null || req.safeCredit()==null || req.paycheckDate()==null ||
           req.paycheck().signum()<=0 || req.safeCredit().signum()<0 ||
           req.safeCredit().compareTo(req.paycheck())>0 ||
           req.paycheck().scale()>2 || req.safeCredit().scale()>2 ||
           req.paycheckDate().isAfter(LocalDate.now()))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Invalid paycheck");
        String user=jwt.getSubject();
        db.queryForList("SELECT user_id FROM account_safe_balances WHERE user_id=? FOR UPDATE",user);
        int inserted=db.update("INSERT INTO account_paycheck_credits(user_id,period_id,paycheck,safe_credit,paycheck_date) VALUES(?,?,?,?,?) ON CONFLICT DO NOTHING",
            user,req.periodId(),req.paycheck(),req.safeCredit(),req.paycheckDate());
        if(inserted==0) throw new ResponseStatusException(HttpStatus.CONFLICT,"Paycheck already credited");
        db.update("INSERT INTO account_safe_balances(user_id,allocation,start_date) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET allocation=account_safe_balances.allocation+EXCLUDED.allocation",
            user,req.safeCredit(),req.paycheckDate());
        return Map.of("credited",req.safeCredit(),"success",true);
    }
}
