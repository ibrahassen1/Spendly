package com.spendly.backend.config;

import org.springframework.context.annotation.Configuration;
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

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
                .allowedOrigins(
                        "https://spendly-two-beige.vercel.app"
                )
                .allowedOriginPatterns(
                        "https://spendly-*.vercel.app"
                )
                .allowedMethods("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS")
                .allowedHeaders("Content-Type", "Authorization", "Accept")
                .allowCredentials(false)
                .maxAge(3600);
    }
}
