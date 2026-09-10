package com.spendly.backend.controllers;

import com.spendly.backend.dto.AllocationRequest;
import com.spendly.backend.dto.SafeToSpendResponse;
import com.spendly.backend.models.SpendingAllocation;
import com.spendly.backend.services.SafeToSpendService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/safe-to-spend")
@CrossOrigin(origins = "http://localhost:5173")
public class SafeToSpendController {

    private final SafeToSpendService safeToSpendService;

    public SafeToSpendController(SafeToSpendService safeToSpendService) {
        this.safeToSpendService = safeToSpendService;
    }

    @PostMapping("/allocation")
    public ResponseEntity<SpendingAllocation> createAllocation(
            @RequestBody AllocationRequest request
    ) {
        return ResponseEntity.ok(
                safeToSpendService.createAllocation(request)
        );
    }

    @GetMapping
    public ResponseEntity<SafeToSpendResponse> getSafeToSpend() {
        return ResponseEntity.ok(
                safeToSpendService.calculateSafeToSpend()
        );
    }
}
