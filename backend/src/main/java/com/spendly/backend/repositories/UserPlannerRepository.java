package com.spendly.backend.repositories;

import com.spendly.backend.models.UserPlanner;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserPlannerRepository extends JpaRepository<UserPlanner, String> {}
