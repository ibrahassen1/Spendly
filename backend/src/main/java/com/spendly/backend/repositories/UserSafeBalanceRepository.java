package com.spendly.backend.repositories;
import com.spendly.backend.models.UserSafeBalance;
import org.springframework.data.jpa.repository.JpaRepository;
public interface UserSafeBalanceRepository extends JpaRepository<UserSafeBalance,String>{}