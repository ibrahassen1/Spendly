package com.spendly.backend.controllers;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import com.spendly.backend.models.UserPlanner;
import com.spendly.backend.repositories.UserPlannerRepository;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/planner")
public class UserPlannerController {
    private final UserPlannerRepository repository;
    private final ObjectMapper mapper = new ObjectMapper();

    public UserPlannerController(UserPlannerRepository repository) {
        this.repository = repository;
    }

    @GetMapping(produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<String> get(@AuthenticationPrincipal Jwt jwt) {
        if (jwt == null) return ResponseEntity.status(401).build();
        return repository.findById(jwt.getSubject())
                .map(p -> ResponseEntity.ok(p.getPlannerJson()))
                .orElseGet(() -> ResponseEntity.noContent().build());
    }

    @PutMapping(consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<Void> put(@AuthenticationPrincipal Jwt jwt, @RequestBody JsonNode planner) throws Exception {
        if (jwt == null) return ResponseEntity.status(401).build();
        if (!planner.isObject() || !planner.path("periods").isArray()
                || !planner.path("categories").isArray() || !planner.path("goals").isObject()) {
            return ResponseEntity.badRequest().build();
        }
        String json = mapper.writeValueAsString(planner);
        if (json.length() > 250_000) return ResponseEntity.status(413).build();
        UserPlanner record = repository.findById(jwt.getSubject()).orElseGet(UserPlanner::new);
        record.setUserId(jwt.getSubject());
        record.setPlannerJson(json);
        repository.save(record);
        return ResponseEntity.noContent().build();
    }
}
