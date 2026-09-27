package com.spendly.backend.controllers;

import com.spendly.backend.dto.AllocationRequest;
import com.spendly.backend.dto.MoneyAdjustmentRequest;
import com.spendly.backend.dto.MoneyAdjustmentResponse;
import com.spendly.backend.dto.SafeToSpendResponse;
import com.spendly.backend.services.SafeToSpendService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/safe-to-spend")
@CrossOrigin(origins = {
        "http://localhost:5173",
        "https://spendly-two-beige.vercel.app"
})
public class SafeToSpendController {

    private final SafeToSpendService safeToSpendService;

    public SafeToSpendController(
            SafeToSpendService safeToSpendService
    ) {
        this.safeToSpendService = safeToSpendService;
    }

    @PostMapping("/allocation")
    public ResponseEntity<SafeToSpendResponse> createAllocation(
            @RequestBody AllocationRequest request
    ) {
        return ResponseEntity.ok(
                safeToSpendService.setAllocation(request)
        );
    }

    @PostMapping("/adjustments")
    public ResponseEntity<SafeToSpendResponse> addMoney(
            @RequestBody MoneyAdjustmentRequest request
    ) {
        return ResponseEntity.ok(
                safeToSpendService.addMoney(request)
        );
    }

    @GetMapping("/adjustments")
    public ResponseEntity<List<MoneyAdjustmentResponse>>
    getAdjustments() {

        return ResponseEntity.ok(
                safeToSpendService.getCurrentPeriodAdjustments()
        );
    }

    @GetMapping
    public ResponseEntity<SafeToSpendResponse> getSafeToSpend() {
        return ResponseEntity.ok(
                safeToSpendService.calculateSafeToSpend()
        );
    }
}
