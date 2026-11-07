package com.spendly.backend;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

/**
 * Boot smoke test: use dummy Google settings and a mocked Clerk JWT decoder.
 * No Google OAuth or live Clerk calls are made.
 */
@SpringBootTest(properties = {
    "google.client-id=test-client",
    "google.client-secret=test-secret",
    "google.redirect-uri=http://localhost:8080/api/account/gmail/callback",
    "spring.flyway.out-of-order=true",
    "spendly.auth.issuer-uri=https://example.invalid"
})
class BackendApplicationTests {

    @MockitoBean
    JwtDecoder jwtDecoder;

    @Test
    void contextLoads() {
    }
}
