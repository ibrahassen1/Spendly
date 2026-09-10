package com.spendly.backend.repositories;

import com.spendly.backend.models.EmailAlertTransaction;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface EmailAlertTransactionRepository
        extends JpaRepository<EmailAlertTransaction, Long> {

    Optional<EmailAlertTransaction> findByGmailMessageId(
            String gmailMessageId
    );

    List<EmailAlertTransaction> findTop5ByOrderByCreatedAtDesc();
}
