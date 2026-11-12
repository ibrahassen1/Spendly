package com.spendly.backend.controllers;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.time.LocalDate;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/** Exercise the real security filter chain and JSON HTTP routes with a test JWT. */
@SpringBootTest(properties={
    "google.client-id=test-client","google.client-secret=test-secret",
    "google.redirect-uri=http://localhost:8080/api/account/gmail/callback",
    "spring.flyway.out-of-order=true","spendly.auth.issuer-uri=https://example.invalid"
})
@AutoConfigureMockMvc
@Transactional
class AuthenticatedRoutesIntegrationTests {
    @Autowired MockMvc mvc;
    @MockitoBean JwtDecoder decoder;
    private final String token="qa-jwt-token";

    @BeforeEach void jwtIdentity(){
        when(decoder.decode(anyString())).thenReturn(
            Jwt.withTokenValue(token).header("alg","RS256").subject("qa-route-user").build());
    }

    @Test void newlyAddedRoutesAreAllowedForSignedInUsers() throws Exception {
        mvc.perform(post("/api/account/safe-to-spend/initialize")
                .header("Authorization","Bearer "+token))
            .andExpect(status().isOk());

        mvc.perform(put("/api/account/safe-to-spend/baseline")
                .header("Authorization","Bearer "+token)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"amount\":500,\"startDate\":\""+LocalDate.now().minusDays(2)+"\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.safeToSpend").value(500));

        mvc.perform(post("/api/account/safe-to-spend/planned-paychecks")
                .header("Authorization","Bearer "+token)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"periodId\":\"qa-pay\",\"paycheck\":1000,\"safeCredit\":0,\"paycheckDate\":\""+LocalDate.now()+"\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.safeToSpend").value(500));

        mvc.perform(post("/api/account/safe-to-spend/adjustments")
                .header("Authorization","Bearer "+token)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"requestId\":\"qa-add\",\"amount\":75,\"note\":\"Zelle for food\",\"occurredOn\":\""+LocalDate.now()+"\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.safeToSpend").value(575));
    }

    @Test void sensitiveRoutesAreNotPublic() throws Exception {
        mvc.perform(post("/api/account/safe-to-spend/initialize"))
            .andExpect(status().isUnauthorized());
        mvc.perform(put("/api/account/safe-to-spend/baseline")
                .contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andExpect(status().isUnauthorized());
        mvc.perform(post("/api/account/safe-to-spend/planned-paychecks")
                .contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andExpect(status().isUnauthorized());
    }
}
