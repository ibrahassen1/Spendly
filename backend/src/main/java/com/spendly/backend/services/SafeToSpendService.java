package com.spendly.backend.services;

import com.spendly.backend.dto.AllocationRequest;
import com.spendly.backend.dto.MoneyAdjustmentRequest;
import com.spendly.backend.dto.MoneyAdjustmentResponse;
import com.spendly.backend.dto.SafeToSpendResponse;
import com.spendly.backend.models.EmailAlertTransaction;
import com.spendly.backend.models.MoneyAdjustment;
import com.spendly.backend.models.SpendingAllocation;
import com.spendly.backend.repositories.EmailAlertTransactionRepository;
import com.spendly.backend.repositories.MoneyAdjustmentRepository;
import com.spendly.backend.repositories.SpendingAllocationRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

@Service
public class SafeToSpendService {

    private final SpendingAllocationRepository spendingAllocationRepository;
    private final EmailAlertTransactionRepository emailAlertTransactionRepository;
    private final MoneyAdjustmentRepository moneyAdjustmentRepository;

    public SafeToSpendService(
            SpendingAllocationRepository spendingAllocationRepository,
            EmailAlertTransactionRepository emailAlertTransactionRepository,
            MoneyAdjustmentRepository moneyAdjustmentRepository
    ) {
        this.spendingAllocationRepository = spendingAllocationRepository;
        this.emailAlertTransactionRepository = emailAlertTransactionRepository;
        this.moneyAdjustmentRepository = moneyAdjustmentRepository;
    }

    public SafeToSpendResponse setAllocation(
            AllocationRequest request
    ) {
        if (request.amount() == null) {
            throw new IllegalArgumentException(
                    "Allocation amount is required"
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

    @Transactional
    public SafeToSpendResponse addMoney(
            MoneyAdjustmentRequest request
    ) {
        if (request.amount() == null ||
                request.amount().compareTo(BigDecimal.ZERO) == 0) {
            throw new IllegalArgumentException(
                    "Adjustment amount must not be zero"
            );
        }

        SpendingAllocation currentAllocation =
                spendingAllocationRepository
                        .findTopByOrderByCreatedAtDesc()
                        .orElseThrow(
                                () -> new RuntimeException(
                                        "No spending allocation has been set"
                                )
                        );

        MoneyAdjustment adjustment =
                new MoneyAdjustment();

        adjustment.setAmount(request.amount());
        adjustment.setAdjustmentDate(LocalDate.now());

        moneyAdjustmentRepository.save(adjustment);

        SpendingAllocation updatedAllocation =
                new SpendingAllocation();

        updatedAllocation.setAmount(
                currentAllocation
                        .getAmount()
                        .add(request.amount())
        );

        updatedAllocation.setStartDate(
                currentAllocation.getStartDate()
        );

        spendingAllocationRepository.save(
                updatedAllocation
        );

        return calculateSafeToSpend();
    }

    public List<MoneyAdjustmentResponse>
    getCurrentPeriodAdjustments() {

        SpendingAllocation allocation =
                spendingAllocationRepository
                        .findTopByOrderByCreatedAtDesc()
                        .orElseThrow(
                                () -> new RuntimeException(
                                        "No spending allocation has been set"
                                )
                        );

        return moneyAdjustmentRepository
                .findByAdjustmentDateGreaterThanEqualOrderByCreatedAtDesc(
                        allocation.getStartDate()
                )
                .stream()
                .map(
                        adjustment ->
                                new MoneyAdjustmentResponse(
                                        adjustment.getId(),
                                        adjustment.getAmount(),
                                        adjustment.getAdjustmentDate(),
                                        adjustment.getCreatedAt()
                                )
                )
                .toList();
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
                        .filter(
                                transaction ->
                                        !transaction
                                                .getTransactionDate()
                                                .isBefore(
                                                        allocation.getStartDate()
                                                )
                        )
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
