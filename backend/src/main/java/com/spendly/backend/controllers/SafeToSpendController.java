package com.spendly.backend.controllers;
import com.spendly.backend.dto.*;
import com.spendly.backend.models.*;
import com.spendly.backend.repositories.*;
import java.math.BigDecimal;
import java.util.List;
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
 public SafeToSpendController(UserSafeBalanceRepository balances,UserMoneyAdjustmentRepository adjustments){
  this.balances=balances;this.adjustments=adjustments;
 }
 private UserSafeBalance current(Jwt jwt){
  return balances.findById(jwt.getSubject()).orElseThrow(()->new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.NOT_FOUND,"No account allocation yet"));
 }
 private SafeToSpendResponse response(UserSafeBalance balance){
  // Gmail spending is intentionally excluded until transactions and OAuth are isolated by account.
  return new SafeToSpendResponse(balance.getAllocation(),BigDecimal.ZERO,balance.getAllocation(),balance.getStartDate());
 }
 @GetMapping public SafeToSpendResponse get(@AuthenticationPrincipal Jwt jwt){return response(current(jwt));}
 @PostMapping("/allocation") @Transactional
 public SafeToSpendResponse set(@AuthenticationPrincipal Jwt jwt,@RequestBody AllocationRequest request){
  if(request.amount()==null||request.startDate()==null||request.amount().signum()<0)
   throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.BAD_REQUEST,"Invalid allocation");
  UserSafeBalance b=balances.findById(jwt.getSubject()).orElseGet(UserSafeBalance::new);
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
