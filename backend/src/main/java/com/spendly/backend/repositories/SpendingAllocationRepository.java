package com.spendly.backend.repositories;

import com.spendly.backend.models.SpendingAllocation;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface SpendingAllocationRepository extends JpaRepository<SpendingAllocation, Long> {

    Optional<SpendingAllocation> findTopByOrderByCreatedAtDesc();
}
