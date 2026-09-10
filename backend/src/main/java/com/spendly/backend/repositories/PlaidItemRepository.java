package com.spendly.backend.repositories;

import com.spendly.backend.models.PlaidItem;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PlaidItemRepository extends JpaRepository<PlaidItem, Long> {
}
