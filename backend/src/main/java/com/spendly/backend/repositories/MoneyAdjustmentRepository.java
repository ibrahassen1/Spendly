package com.spendly.backend.repositories;

import com.spendly.backend.models.MoneyAdjustment;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;

public interface MoneyAdjustmentRepository
        extends JpaRepository<MoneyAdjustment, Long> {

    List<MoneyAdjustment>
    findByAdjustmentDateGreaterThanEqualOrderByCreatedAtDesc(
            LocalDate startDate
    );
}
