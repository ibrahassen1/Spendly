package com.spendly.backend.repositories;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.spendly.backend.models.EmailAlertTransaction;

public interface EmailAlertTransactionRepository
        extends JpaRepository<EmailAlertTransaction, Long> {

    Optional<EmailAlertTransaction> findByGmailMessageId(
            String gmailMessageId
    );

    List<EmailAlertTransaction>
    findByTransactionDateGreaterThanEqualAndStatusIgnoreCaseOrderByTransactionTimeDesc(
            LocalDate startDate,
            String status
    );

    @Query("""
            SELECT COALESCE(SUM(t.amount), 0)
            FROM EmailAlertTransaction t
            WHERE t.transactionDate >= :startDate
            AND UPPER(t.status) = 'TEMPORARY'
            """)
    BigDecimal sumTemporarySpendingSince(
            @Param("startDate") LocalDate startDate
    );
}