package com.spendly.backend.models;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "user_planners")
public class UserPlanner {
    @Id
    @Column(name = "user_id", nullable = false, length = 255)
    private String userId;

    @Column(name = "planner_json", nullable = false, columnDefinition = "TEXT")
    private String plannerJson;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }
    public String getPlannerJson() { return plannerJson; }
    public void setPlannerJson(String plannerJson) { this.plannerJson = plannerJson; }
    public Instant getUpdatedAt() { return updatedAt; }
    @PrePersist @PreUpdate
    public void stamp() { updatedAt = Instant.now(); }
}
