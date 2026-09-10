package com.spendly.backend.repositories;

import com.spendly.backend.models.SpendingAllocation;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SpendingAllocationRepository extends JpaRepository<SpendingAllocation, Long> {
}
