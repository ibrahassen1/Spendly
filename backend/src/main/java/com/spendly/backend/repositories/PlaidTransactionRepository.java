package com.spendly.backend.repositories;

import com.spendly.backend.models.PlaidTransaction;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface PlaidTransactionRepository extends JpaRepository<PlaidTransaction, Long> {

    Optional<PlaidTransaction> findByPlaidTransactionId(String plaidTransactionId);

    void deleteByPlaidTransactionId(String plaidTransactionId);

    List<PlaidTransaction> findAllByOrderByTransactionDateDesc();
}
