package com.spendly.backend.models;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDate;
@Entity
@Table(name="user_safe_balances")
public class UserSafeBalance {
 @Id @Column(name="user_id",length=255) private String userId;
 @Column(nullable=false,precision=12,scale=2) private BigDecimal allocation=BigDecimal.ZERO;
 @Column(name="start_date",nullable=false) private LocalDate startDate;
 public String getUserId(){return userId;}
 public void setUserId(String v){userId=v;}
 public BigDecimal getAllocation(){return allocation;}
 public void setAllocation(BigDecimal v){allocation=v;}
 public LocalDate getStartDate(){return startDate;}
 public void setStartDate(LocalDate v){startDate=v;}
}