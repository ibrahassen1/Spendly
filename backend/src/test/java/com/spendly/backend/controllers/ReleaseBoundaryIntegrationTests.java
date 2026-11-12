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

/**
 * Simulates two real JWT-authenticated browser sessions and repeated HTTP reads/writes,
 * backed by temporary PostgreSQL (CI). Does not connect to Google or live accounts.
 */
@SpringBootTest(properties={
  "google.client-id=test-client",
  "google.client-secret=test-secret",
  "google.redirect-uri=https://qa.invalid/api/account/gmail/callback",
  "spendly.gmail.token-encryption-key=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
  "spring.flyway.out-of-order=true",
  "spendly.auth.issuer-uri=https://example.invalid"
})
@AutoConfigureMockMvc
@Transactional
class ReleaseBoundaryIntegrationTests {
  @Autowired MockMvc mvc;
  @Autowired org.springframework.jdbc.core.JdbcTemplate jdbc;
  @MockitoBean JwtDecoder decoder;
  private static final String A="qa-alice-session";
  private static final String B="qa-bob-session";
  private static final String NOW=LocalDate.now().toString();

  @BeforeEach void jwtUsers() {
    when(decoder.decode(anyString())).thenAnswer(inv -> {
      String token=inv.getArgument(0);
      String subject=token.equals(A)?"release-qa-alice":token.equals(B)?"release-qa-bob":"unknown";
      return Jwt.withTokenValue(token).header("alg","RS256").subject(subject).build();
    });
  }
  private String body(String amount,String note,String requestId) {
    return "{\"requestId\":\""+requestId+"\",\"amount\":"+amount+
        ",\"note\":\""+note+"\",\"occurredOn\":\""+NOW+"\"}";
  }

  @Test void sessionReadsPersistAndDifferentUsersCannotReadEachOthersLedgers() throws Exception {
    mvc.perform(post("/api/account/safe-to-spend/initialize").header("Authorization","Bearer "+A))
      .andExpect(status().isOk());
    mvc.perform(post("/api/account/safe-to-spend/initialize").header("Authorization","Bearer "+B))
      .andExpect(status().isOk());
    mvc.perform(put("/api/account/safe-to-spend/baseline")
        .header("Authorization","Bearer "+A).contentType(MediaType.APPLICATION_JSON)
        .content("{\"amount\":500,\"startDate\":\""+NOW+"\"}"))
      .andExpect(status().isOk());
    mvc.perform(put("/api/account/safe-to-spend/baseline")
        .header("Authorization","Bearer "+B).contentType(MediaType.APPLICATION_JSON)
        .content("{\"amount\":200,\"startDate\":\""+NOW+"\"}"))
      .andExpect(status().isOk());
    mvc.perform(post("/api/account/safe-to-spend/adjustments")
        .header("Authorization","Bearer "+A).contentType(MediaType.APPLICATION_JSON)
        .content(body("50","Test paycheck","persistent-1")))
      .andExpect(status().isOk());

    // Equivalent to reloading page and reading anew with the same signed-in account.
    mvc.perform(get("/api/account/safe-to-spend").header("Authorization","Bearer "+A))
      .andExpect(status().isOk()).andExpect(jsonPath("$.safeToSpend").value(550));
    mvc.perform(get("/api/account/safe-to-spend/adjustments").header("Authorization","Bearer "+A))
      .andExpect(status().isOk()).andExpect(jsonPath("$[0].note").value("Test paycheck"));
    mvc.perform(get("/api/account/safe-to-spend").header("Authorization","Bearer "+B))
      .andExpect(status().isOk()).andExpect(jsonPath("$.safeToSpend").value(200));
    mvc.perform(get("/api/account/safe-to-spend/adjustments").header("Authorization","Bearer "+B))
      .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));

    mvc.perform(put("/api/planner").header("Authorization","Bearer "+A)
        .contentType(MediaType.APPLICATION_JSON)
        .content("{\"periods\":[],\"categories\":[],\"goals\":{\"emergency\":{\"target\":3000}},\"expenseItems\":[{\"name\":\"Rent\",\"amount\":1200}]}"))
      .andExpect(status().isNoContent());
    mvc.perform(get("/api/planner").header("Authorization","Bearer "+A))
      .andExpect(status().isOk()).andExpect(jsonPath("$.goals.emergency.target").value(3000))
      .andExpect(jsonPath("$.expenseItems[0].amount").value(1200));
    mvc.perform(get("/api/planner").header("Authorization","Bearer "+B))
      .andExpect(status().isNoContent());
  }

  @Test void invalidAmountsAndDuplicateRequestsNeverApplyTwice() throws Exception {
    mvc.perform(post("/api/account/safe-to-spend/initialize").header("Authorization","Bearer "+A))
      .andExpect(status().isOk());
    mvc.perform(put("/api/account/safe-to-spend/baseline")
        .header("Authorization","Bearer "+A).contentType(MediaType.APPLICATION_JSON)
        .content("{\"amount\":100,\"startDate\":\""+NOW+"\"}"))
      .andExpect(status().isOk());

    mvc.perform(post("/api/account/safe-to-spend/adjustments")
        .header("Authorization","Bearer "+A).contentType(MediaType.APPLICATION_JSON)
        .content(body("0","Not allowed","zero")))
      .andExpect(status().isBadRequest());
    mvc.perform(post("/api/account/safe-to-spend/adjustments")
        .header("Authorization","Bearer "+A).contentType(MediaType.APPLICATION_JSON)
        .content(body("10","","empty-note")))
      .andExpect(status().isBadRequest());
    mvc.perform(put("/api/account/safe-to-spend/baseline")
        .header("Authorization","Bearer "+A).contentType(MediaType.APPLICATION_JSON)
        .content("{\"amount\":999999999999,\"startDate\":\""+NOW+"\"}"))
      .andExpect(status().isBadRequest());

    mvc.perform(post("/api/account/safe-to-spend/adjustments")
        .header("Authorization","Bearer "+A).contentType(MediaType.APPLICATION_JSON)
        .content(body("-20","Test purchase","once-only")))
      .andExpect(status().isOk());
    mvc.perform(post("/api/account/safe-to-spend/adjustments")
        .header("Authorization","Bearer "+A).contentType(MediaType.APPLICATION_JSON)
        .content(body("-20","Test purchase","once-only")))
      .andExpect(status().isOk());
    mvc.perform(post("/api/account/safe-to-spend/adjustments")
        .header("Authorization","Bearer "+A).contentType(MediaType.APPLICATION_JSON)
        .content(body("-25","Changed request","once-only")))
      .andExpect(status().isConflict());
    mvc.perform(get("/api/account/safe-to-spend").header("Authorization","Bearer "+A))
      .andExpect(status().isOk()).andExpect(jsonPath("$.safeToSpend").value(80));
    mvc.perform(get("/api/account/safe-to-spend/adjustments").header("Authorization","Bearer "+A))
      .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1));
  }

  @Test void excludingAndRestoringOneUsersPurchaseAdjustsOnlyTheirBalance() throws Exception {
    mvc.perform(post("/api/account/safe-to-spend/initialize").header("Authorization","Bearer "+A))
      .andExpect(status().isOk());
    mvc.perform(post("/api/account/safe-to-spend/initialize").header("Authorization","Bearer "+B))
      .andExpect(status().isOk());
    for(String token:new String[]{A,B}) {
      mvc.perform(put("/api/account/safe-to-spend/baseline")
          .header("Authorization","Bearer "+token).contentType(MediaType.APPLICATION_JSON)
          .content("{\"amount\":100,\"startDate\":\""+NOW+"\"}"))
        .andExpect(status().isOk());
    }
    String owner="release-qa-alice";
    jdbc.update("INSERT INTO user_email_alert_transactions(user_id,gmail_message_id,merchant,amount,transaction_date,source_bank,status) VALUES(?,?,?,?,?,?,?)",
      owner,"test-spending-1","Test Groceries",new java.math.BigDecimal("30.00"),LocalDate.now(),"TEST","TEMPORARY");
    Long id=jdbc.queryForObject("SELECT id FROM user_email_alert_transactions WHERE user_id=? AND gmail_message_id=?",
      Long.class,owner,"test-spending-1");
    mvc.perform(get("/api/account/safe-to-spend").header("Authorization","Bearer "+A))
      .andExpect(status().isOk()).andExpect(jsonPath("$.safeToSpend").value(70));
    mvc.perform(delete("/api/account/gmail/transactions/"+id).header("Authorization","Bearer "+B))
      .andExpect(status().isNotFound());
    mvc.perform(get("/api/account/safe-to-spend").header("Authorization","Bearer "+A))
      .andExpect(status().isOk()).andExpect(jsonPath("$.safeToSpend").value(70));
    mvc.perform(delete("/api/account/gmail/transactions/"+id).header("Authorization","Bearer "+A))
      .andExpect(status().isNoContent());
    mvc.perform(get("/api/account/safe-to-spend").header("Authorization","Bearer "+A))
      .andExpect(status().isOk()).andExpect(jsonPath("$.safeToSpend").value(100));
    mvc.perform(post("/api/account/gmail/transactions/"+id+"/restore").header("Authorization","Bearer "+B))
      .andExpect(status().isNotFound());
    mvc.perform(post("/api/account/gmail/transactions/"+id+"/restore").header("Authorization","Bearer "+A))
      .andExpect(status().isNoContent());
    mvc.perform(get("/api/account/safe-to-spend").header("Authorization","Bearer "+A))
      .andExpect(status().isOk()).andExpect(jsonPath("$.safeToSpend").value(70));
    mvc.perform(get("/api/account/safe-to-spend").header("Authorization","Bearer "+B))
      .andExpect(status().isOk()).andExpect(jsonPath("$.safeToSpend").value(100));
  }

  @Test void gmailRequiresAuthAndSyncCannotStartWithoutConnection() throws Exception {
    mvc.perform(get("/api/account/gmail/status")).andExpect(status().isUnauthorized());
    mvc.perform(post("/api/account/gmail/connect")).andExpect(status().isUnauthorized());
    mvc.perform(post("/api/account/gmail/sync")).andExpect(status().isUnauthorized());

    mvc.perform(get("/api/account/gmail/status").header("Authorization","Bearer "+A))
      .andExpect(status().isOk()).andExpect(jsonPath("$.connected").value(false));
    mvc.perform(post("/api/account/gmail/sync").header("Authorization","Bearer "+A))
      .andExpect(status().isConflict());
    mvc.perform(post("/api/account/gmail/connect").header("Authorization","Bearer "+A))
      .andExpect(status().isOk())
      .andExpect(jsonPath("$.authorizationUrl").value(org.hamcrest.Matchers.containsString(
        "redirect_uri=https%3A%2F%2Fqa.invalid%2Fapi%2Faccount%2Fgmail%2Fcallback")))
      .andExpect(jsonPath("$.authorizationUrl").value(org.hamcrest.Matchers.containsString(
        "scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fgmail.readonly")));
    mvc.perform(get("/api/account/gmail/status").header("Authorization","Bearer "+A))
      .andExpect(status().isOk()).andExpect(jsonPath("$.connected").value(false));
    mvc.perform(get("/api/account/gmail/transactions").header("Authorization","Bearer "+B))
      .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
  }
}
