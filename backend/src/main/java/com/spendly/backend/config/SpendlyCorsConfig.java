package com.spendly.backend.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import java.util.Arrays;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Allows the production Spendly frontend and Vercel preview deployments
 * owned by the Spendly project to call the API.
 *
 * CORS is not authentication; API write endpoints should be protected
 * separately before exposing multi-user financial data.
 */
@Configuration
public class SpendlyCorsConfig implements WebMvcConfigurer {
    @Value("${SPENDLY_ALLOWED_ORIGINS:http://localhost:5173,http://localhost:5174,http://localhost:5175,https://spendly-two-beige.vercel.app}")
    private String allowedOrigins;

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
                .allowedOrigins(Arrays.stream(allowedOrigins.split(","))
                        .map(String::trim).filter(origin -> !origin.isEmpty()).toArray(String[]::new))
                .allowedMethods("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS")
                .allowedHeaders("Content-Type", "Authorization", "Accept")
                .allowCredentials(false)
                .maxAge(3600);
    }
}
