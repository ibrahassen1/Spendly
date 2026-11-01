package com.spendly.backend.controllers;
import com.spendly.backend.dto.*;
import com.spendly.backend.models.*;
import com.spendly.backend.repositories.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import java.util.List;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/safe-to-spend")
public class SafeToSpendController {
 private final UserSafeBalanceRepository balances;
 private final UserMoneyAdjustmentRepository adjustments;
 private final JdbcTemplate jdbc;
 public SafeToSpendController(UserSafeBalanceRepository balances,UserMoneyAdjustmentRepository adjustments,JdbcTemplate jdbc){
  this.balances=balances;this.adjustments=adjustments;this.jdbc=jdbc;
 }
 private UserSafeBalance current(Jwt jwt){
  return balances.findById(jwt.getSubject()).orElseThrow(()->new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.NOT_FOUND,"No account allocation yet"));
 }
 private SafeToSpendResponse response(UserSafeBalance balance){
  // Gmail spending is intentionally excluded until transactions and OAuth are isolated by account.
  return new SafeToSpendResponse(balance.getAllocation(),BigDecimal.ZERO,balance.getAllocation(),balance.getStartDate());
 }
 @PostMapping("/paychecks") @Transactional
 public SafeToSpendResponse creditPaycheck(@AuthenticationPrincipal Jwt jwt,@RequestBody PaycheckCreditRequest request){
  if(request.periodId()==null||!request.periodId().matches("[A-Za-z0-9_-]{1,100}")||
     request.paycheck()==null||request.safeCredit()==null||request.paycheckDate()==null||
     request.paycheck().scale()>2||request.safeCredit().scale()>2||
     request.paycheck().signum()<=0||request.safeCredit().signum()<0||
     request.safeCredit().compareTo(request.paycheck())>0||
     request.paycheck().compareTo(new BigDecimal("9999999999.99"))>0)
    throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Invalid paycheck");
  String user=jwt.getSubject();
  // Lock one account's submission stream, including first-time balance creation.
  jdbc.queryForObject("SELECT pg_advisory_xact_lock(hashtext(?))",Object.class,user);
  var prior=jdbc.query("SELECT paycheck,safe_credit FROM user_paycheck_credits WHERE user_id=? AND period_id=?",
    (rs,n)->new BigDecimal[]{rs.getBigDecimal(1),rs.getBigDecimal(2)},user,request.periodId());
  if(!prior.isEmpty()){
    if(prior.get(0)[0].compareTo(request.paycheck())!=0 || prior.get(0)[1].compareTo(request.safeCredit())!=0)
      throw new ResponseStatusException(HttpStatus.CONFLICT,"Paycheck ID was already submitted with different amounts");
    return response(current(jwt));
  }
  jdbc.update("INSERT INTO user_safe_balances(user_id,allocation,start_date) VALUES(?,?,?) ON CONFLICT(user_id) DO NOTHING",
    user,BigDecimal.ZERO,request.paycheckDate());
  jdbc.update("INSERT INTO user_paycheck_credits(user_id,period_id,paycheck,safe_credit,paycheck_date) VALUES(?,?,?,?,?)",
    user,request.periodId(),request.paycheck(),request.safeCredit(),request.paycheckDate());
  jdbc.update("UPDATE user_safe_balances SET allocation=allocation+? WHERE user_id=?",
    request.safeCredit(),user);
  return response(current(jwt));
 }
 @GetMapping("/paychecks")
 public List<Map<String,Object>> paycheckHistory(@AuthenticationPrincipal Jwt jwt){
  return jdbc.queryForList("SELECT period_id AS \"periodId\", paycheck, safe_credit AS \"safeCredit\", paycheck_date AS \"paycheckDate\", created_at AS \"creditedAt\" FROM user_paycheck_credits WHERE user_id=? ORDER BY paycheck_date DESC NULLS LAST, created_at DESC",jwt.getSubject());
 }
 @GetMapping public SafeToSpendResponse get(@AuthenticationPrincipal Jwt jwt){return response(current(jwt));}
 @PostMapping("/opening-balance") @Transactional
 public SafeToSpendResponse set(@AuthenticationPrincipal Jwt jwt,@RequestBody AllocationRequest request){
  if(request.amount()==null||request.startDate()==null||request.amount().signum()<0)
   throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.BAD_REQUEST,"Invalid allocation");
  if(balances.existsById(jwt.getSubject()))
   throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.CONFLICT,"Opening balance already exists; use ledger adjustments instead");
  UserSafeBalance b=new UserSafeBalance();
  b.setUserId(jwt.getSubject());b.setAllocation(request.amount());b.setStartDate(request.startDate());
  return response(balances.save(b));
 }
 @PostMapping("/adjustments") @Transactional
 public SafeToSpendResponse adjust(@AuthenticationPrincipal Jwt jwt,@RequestBody MoneyAdjustmentRequest request){
  if(request.amount()==null||request.amount().signum()==0)
   throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.BAD_REQUEST,"Invalid adjustment");
  UserSafeBalance b=current(jwt);
  UserMoneyAdjustment entry=new UserMoneyAdjustment();
  entry.setUserId(jwt.getSubject());entry.setAmount(request.amount());
  adjustments.save(entry);
  b.setAllocation(b.getAllocation().add(request.amount()));
  return response(balances.save(b));
 }
 @GetMapping("/adjustments")
 public List<MoneyAdjustmentResponse> history(@AuthenticationPrincipal Jwt jwt){
  UserSafeBalance b=current(jwt);
  return adjustments.findByUserIdAndAdjustmentDateGreaterThanEqualOrderByCreatedAtDesc(jwt.getSubject(),b.getStartDate())
   .stream().map(a->new MoneyAdjustmentResponse(a.getId(),a.getAmount(),a.getAdjustmentDate(),a.getCreatedAt())).toList();
 }
}
