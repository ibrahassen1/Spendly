package com.spendly.backend.config;

import java.util.List;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.server.resource.web.BearerTokenAuthenticationEntryPoint;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

/**
 * Dedicated filter chain for Gmail routes. All account actions require Clerk JWTs.
 * Google redirects to callback without a Clerk bearer token.
 */
@Configuration
public class GmailSecurityConfiguration {
 @Bean
 @Order(1)
 SecurityFilterChain gmailSecurityFilterChain(HttpSecurity http) throws Exception {
  return http
   .securityMatcher("/api/gmail/**")
   .csrf(csrf -> csrf.disable())
   .cors(cors -> cors.configurationSource(gmailCorsSource()))
   .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
   .authorizeHttpRequests(auth -> auth
     .requestMatchers(HttpMethod.OPTIONS, "/api/gmail/**").permitAll()
     .requestMatchers(HttpMethod.GET, "/api/gmail/connection/callback").permitAll()
     .anyRequest().authenticated())
   .oauth2ResourceServer(oauth -> oauth.jwt(jwt -> {}))
   .build();
 }
 @Bean
 CorsConfigurationSource gmailCorsSource() {
  CorsConfiguration c=new CorsConfiguration();
  c.setAllowedOrigins(List.of("http://localhost:5173"));
  c.setAllowedMethods(List.of("GET","POST","DELETE","OPTIONS"));
  c.setAllowedHeaders(List.of("Authorization","Content-Type"));
  c.setMaxAge(3600L);
  UrlBasedCorsConfigurationSource source=new UrlBasedCorsConfigurationSource();
  source.registerCorsConfiguration("/api/gmail/**",c);
  return source;
 }
}
