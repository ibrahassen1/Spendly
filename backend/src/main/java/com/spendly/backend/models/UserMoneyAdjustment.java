package com.spendly.backend.models;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
@Entity
@Table(name="user_money_adjustments")
public class UserMoneyAdjustment {
 @Id @GeneratedValue(strategy=GenerationType.IDENTITY) private Long id;
 @Column(name="user_id",nullable=false,length=255) private String userId;
 @Column(nullable=false,precision=12,scale=2) private BigDecimal amount;
 @Column(name="adjustment_date",nullable=false) private LocalDate adjustmentDate;
 @Column(name="created_at",nullable=false) private LocalDateTime createdAt;
 @PrePersist public void stamp(){if(adjustmentDate==null) adjustmentDate=LocalDate.now(); if(createdAt==null)createdAt=LocalDateTime.now();}
 public Long getId(){return id;} public String getUserId(){return userId;} public void setUserId(String v){userId=v;}
 public BigDecimal getAmount(){return amount;} public void setAmount(BigDecimal v){amount=v;}
 public LocalDate getAdjustmentDate(){return adjustmentDate;} public void setAdjustmentDate(LocalDate v){adjustmentDate=v;}
 public LocalDateTime getCreatedAt(){return createdAt;}
}