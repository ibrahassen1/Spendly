package com.spendly.backend.services;

import com.spendly.backend.dto.AllocationRequest;
import com.spendly.backend.dto.SafeToSpendResponse;
import com.spendly.backend.models.EmailAlertTransaction;
import com.spendly.backend.models.SpendingAllocation;
import com.spendly.backend.repositories.EmailAlertTransactionRepository;
import com.spendly.backend.repositories.SpendingAllocationRepository;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;

@Service
public class SafeToSpendService {

    private final SpendingAllocationRepository spendingAllocationRepository;
    private final EmailAlertTransactionRepository emailAlertTransactionRepository;

    public SafeToSpendService(
            SpendingAllocationRepository spendingAllocationRepository,
            EmailAlertTransactionRepository emailAlertTransactionRepository
    ) {
        this.spendingAllocationRepository = spendingAllocationRepository;
        this.emailAlertTransactionRepository = emailAlertTransactionRepository;
    }

    public SafeToSpendResponse setAllocation(
            AllocationRequest request
    ) {
        if (request.amount() == null
                || request.amount().compareTo(BigDecimal.ZERO) < 0) {

            throw new IllegalArgumentException(
                    "Allocation amount must be zero or greater"
            );
        }

        if (request.startDate() == null) {
            throw new IllegalArgumentException(
                    "Allocation start date is required"
            );
        }

        SpendingAllocation allocation =
                new SpendingAllocation();

        allocation.setAmount(request.amount());
        allocation.setStartDate(request.startDate());

        spendingAllocationRepository.save(allocation);

        return calculateSafeToSpend();
    }

    public SafeToSpendResponse calculateSafeToSpend() {

        SpendingAllocation allocation =
                spendingAllocationRepository
                        .findTopByOrderByCreatedAtDesc()
                        .orElseThrow(
                                () -> new RuntimeException(
                                        "No spending allocation has been set"
                                )
                        );

        BigDecimal countedSpending =
                emailAlertTransactionRepository
                        .findAll()
                        .stream()

                        // Only count purchases on or after
                        // the current allocation start date.
                        .filter(
                                transaction ->
                                        !transaction
                                                .getTransactionDate()
                                                .isBefore(
                                                        allocation.getStartDate()
                                                )
                        )

                        // Only count transactions that have
                        // not been reconciled/removed.
                        .filter(
                                transaction ->
                                        "TEMPORARY".equalsIgnoreCase(
                                                transaction.getStatus()
                                        )
                        )

                        .map(
                                EmailAlertTransaction::getAmount
                        )

                        .reduce(
                                BigDecimal.ZERO,
                                BigDecimal::add
                        );

        BigDecimal safeToSpend =
                allocation
                        .getAmount()
                        .subtract(countedSpending);

        return new SafeToSpendResponse(
                allocation.getAmount(),
                countedSpending,
                safeToSpend,
                allocation.getStartDate()
        );
    }
}
