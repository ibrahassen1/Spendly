package com.spendly.backend.services;

import com.spendly.backend.dto.AllocationRequest;
import com.spendly.backend.dto.SafeToSpendResponse;
import com.spendly.backend.models.PlaidTransaction;
import com.spendly.backend.models.SpendingAllocation;
import com.spendly.backend.repositories.PlaidTransactionRepository;
import com.spendly.backend.repositories.SpendingAllocationRepository;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;

@Service
public class SafeToSpendService {

    private final SpendingAllocationRepository spendingAllocationRepository;
    private final PlaidTransactionRepository plaidTransactionRepository;

    public SafeToSpendService(
            SpendingAllocationRepository spendingAllocationRepository,
            PlaidTransactionRepository plaidTransactionRepository
    ) {
        this.spendingAllocationRepository = spendingAllocationRepository;
        this.plaidTransactionRepository = plaidTransactionRepository;
    }

    public SpendingAllocation createAllocation(AllocationRequest request) {
        if (request.amount() == null || request.amount().compareTo(BigDecimal.ZERO) < 0) {
            throw new IllegalArgumentException("Allocation amount must be zero or greater");
        }

        if (request.startDate() == null) {
            throw new IllegalArgumentException("startDate is required");
        }

        SpendingAllocation allocation = new SpendingAllocation();
        allocation.setAmount(request.amount());
        allocation.setStartDate(request.startDate());

        return spendingAllocationRepository.save(allocation);
    }

    public SafeToSpendResponse calculateSafeToSpend() {
        SpendingAllocation allocation = spendingAllocationRepository
                .findTopByOrderByCreatedAtDesc()
                .orElseThrow(
                        () -> new RuntimeException("No spending allocation has been created")
                );

        BigDecimal countedSpending = plaidTransactionRepository
                .findAll()
                .stream()
                .filter(transaction ->
                        !transaction.getTransactionDate()
                                .isBefore(allocation.getStartDate())
                )
                .filter(transaction ->
                        transaction.getAmount()
                                .compareTo(BigDecimal.ZERO) > 0
                )
                .filter(this::shouldCount)
                .map(PlaidTransaction::getAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        BigDecimal safeToSpend =
                allocation.getAmount().subtract(countedSpending);

        return new SafeToSpendResponse(
                allocation.getAmount(),
                countedSpending,
                safeToSpend,
                allocation.getStartDate()
        );
    }

    private boolean shouldCount(PlaidTransaction transaction) {
        String category = transaction.getCategory();

        if (category == null) {
            return true;
        }

        String normalized = category.toLowerCase();

        return !normalized.contains("transfer")
                && !normalized.contains("loan payment")
                && !normalized.contains("loan_payments");
    }
}
