package com.spendly.backend.repositories;

import com.spendly.backend.models.GmailCredential;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface GmailCredentialRepository
        extends JpaRepository<GmailCredential, Long> {

    Optional<GmailCredential> findTopByOrderByIdDesc();
}
