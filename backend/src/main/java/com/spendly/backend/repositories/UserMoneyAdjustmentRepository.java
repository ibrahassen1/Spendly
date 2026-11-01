package com.spendly.backend.repositories;
import com.spendly.backend.models.UserMoneyAdjustment;
import org.springframework.data.jpa.repository.JpaRepository;
import java.time.LocalDate;
import java.util.List;
public interface UserMoneyAdjustmentRepository extends JpaRepository<UserMoneyAdjustment,Long>{
 List<UserMoneyAdjustment> findByUserIdAndAdjustmentDateGreaterThanEqualOrderByCreatedAtDesc(String userId,LocalDate date);
}