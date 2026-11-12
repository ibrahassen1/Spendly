package com.spendly.backend.controllers;

import static org.junit.jupiter.api.Assertions.*;

import java.math.BigDecimal;
import java.time.LocalDate;

import org.junit.jupiter.api.Test;
import javax.sql.DataSource;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.datasource.DataSourceUtils;
import org.springframework.jdbc.datasource.init.ScriptUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.security.oauth2.jwt.JwtDecoder;

/** Runs with Flyway against disposable CI PostgreSQL, never a production database. */
@SpringBootTest(properties = {
    "google.client-id=test-client",
    "google.client-secret=test-secret",
    "google.redirect-uri=http://localhost:8080/api/account/gmail/callback",
    "spring.flyway.out-of-order=true",
    "spendly.auth.issuer-uri=https://example.invalid"
})
@Transactional
class FinancialWorkflowIntegrationTests {
    @MockitoBean JwtDecoder jwtDecoder;
    @Autowired JdbcTemplate jdbc;
    @Autowired DataSource dataSource;
    @Autowired AccountSafeToSpendController controller;

    private final Jwt alice=Jwt.withTokenValue("integration-alice").header("alg","none").subject("test-ibra-a").build();
    private final Jwt bob=Jwt.withTokenValue("integration-bob").header("alg","none").subject("test-sister-b").build();
    private final LocalDate start=LocalDate.now().minusDays(5);

    @Test
    void manualBaselineFiltersByDateAndDoesNotIncludeOtherUsersPurchases() {
        controller.setBaseline(alice,new AccountSafeToSpendController.BaselineRequest(new BigDecimal("500.00"),start));
        controller.setBaseline(bob,new AccountSafeToSpendController.BaselineRequest(new BigDecimal("250.00"),start));

        addTransaction("test-ibra-a","before",new BigDecimal("99.00"),start.minusDays(1),"TEMPORARY");
        addTransaction("test-ibra-a","after",new BigDecimal("12.50"),start.plusDays(1),"TEMPORARY");
        addTransaction("test-ibra-a","excluded",new BigDecimal("10.00"),start.plusDays(2),"DELETED");
        addTransaction("test-sister-b","sister-after",new BigDecimal("50.00"),start.plusDays(1),"TEMPORARY");

        var a=controller.get(alice);
        var b=controller.get(bob);
        assertEquals(0,new BigDecimal("487.50").compareTo(a.safeToSpend()));
        assertEquals(0,new BigDecimal("12.50").compareTo(a.countedSpending()));
        assertEquals(0,new BigDecimal("200.00").compareTo(b.safeToSpend()));

        controller.setBaseline(alice,new AccountSafeToSpendController.BaselineRequest(new BigDecimal("300.00"),start.plusDays(2)));
        assertEquals(0,new BigDecimal("300.00").compareTo(controller.get(alice).safeToSpend()));
        assertEquals(0,new BigDecimal("200.00").compareTo(controller.get(bob).safeToSpend()));
    }

    @Test
    void paycheckPlanningCannotChangeSafeBalanceAndIsIdempotent() {
        controller.setBaseline(alice,new AccountSafeToSpendController.BaselineRequest(new BigDecimal("125.00"),start));
        var request=new AccountSafeToSpendController.PaycheckRequest(
            "test-paycheck-1",new BigDecimal("1200.00"),new BigDecimal("450.00"),LocalDate.now());
        controller.planPaycheck(alice,request);
        controller.planPaycheck(alice,request);
        assertEquals(0,new BigDecimal("125.00").compareTo(controller.get(alice).safeToSpend()));
        assertEquals(1,jdbc.queryForObject("SELECT COUNT(*) FROM user_paycheck_credits WHERE user_id=?",
            Integer.class,"test-ibra-a"));
        assertEquals(0,BigDecimal.ZERO.compareTo(jdbc.queryForObject(
            "SELECT safe_credit FROM user_paycheck_credits WHERE user_id=?",BigDecimal.class,"test-ibra-a")));
    }

    @Test
    void manualNotesDatesAndDuplicateRequestsPreserveHistoryAndDoNotLeakAccounts() {
        controller.setBaseline(alice,new AccountSafeToSpendController.BaselineRequest(new BigDecimal("100.00"),start));
        controller.setBaseline(bob,new AccountSafeToSpendController.BaselineRequest(new BigDecimal("800.00"),start));

        var req=new AccountSafeToSpendController.AdjustmentRequest("test-adjust-1",
            new BigDecimal("75.00"),"Zelle for food",start.plusDays(1));
        controller.adjust(alice,req);
        controller.adjust(alice,req);
        assertEquals(0,new BigDecimal("175.00").compareTo(controller.get(alice).safeToSpend()));
        assertEquals(0,new BigDecimal("800.00").compareTo(controller.get(bob).safeToSpend()));
        assertEquals(1,jdbc.queryForObject(
            "SELECT COUNT(*) FROM user_money_adjustments WHERE user_id=?",Integer.class,"test-ibra-a"));
        var history=controller.adjustments(alice);
        assertEquals("Zelle for food",history.get(0).get("note"));
        assertEquals(start.plusDays(1),((java.sql.Date) history.get(0).get("occurredOn")).toLocalDate());

        controller.setBaseline(alice,new AccountSafeToSpendController.BaselineRequest(new BigDecimal("500.00"),start.plusDays(2)));
        assertEquals(0,new BigDecimal("500.00").compareTo(controller.get(alice).safeToSpend()));
        assertEquals(1,controller.adjustments(alice).size());
    }

    @Test
    void migrationV104PreservesExistingAdjustmentHistory() throws Exception {
        // Start with the old V103 table layout in a transaction-local schema.
        jdbc.execute("CREATE SCHEMA qa_v103");
        jdbc.execute("CREATE TABLE qa_v103.user_money_adjustments (" +
            "id BIGSERIAL PRIMARY KEY,user_id VARCHAR(255) NOT NULL," +
            "request_id VARCHAR(100) NOT NULL,amount NUMERIC(12,2) NOT NULL," +
            "created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)");
        jdbc.update("INSERT INTO qa_v103.user_money_adjustments(user_id,request_id,amount) VALUES(?,?,?)",
            "test-ibra-a","before-upgrade",new BigDecimal("42.00"));
        jdbc.execute("SET LOCAL search_path TO qa_v103");
        ScriptUtils.executeSqlScript(DataSourceUtils.getConnection(dataSource),
            new ClassPathResource("db/migration/V104__user_adjustment_notes_dates.sql"));
        var old=jdbc.queryForMap("SELECT amount,note,occurred_on FROM user_money_adjustments WHERE request_id=?",
            "before-upgrade");
        assertEquals(0,new BigDecimal("42.00").compareTo((BigDecimal)old.get("amount")));
        assertEquals("Manual adjustment",old.get("note"));
        assertNotNull(old.get("occurred_on"));
        jdbc.update("INSERT INTO user_money_adjustments(user_id,request_id,amount,note,occurred_on) " +
                "VALUES(?,?,?,?,?)","test-ibra-a","new-upgrade",new BigDecimal("25.00"),
                "Paycheck",LocalDate.now());
        assertEquals(2,jdbc.queryForObject("SELECT COUNT(*) FROM user_money_adjustments",Integer.class));
    }

    private void addTransaction(String user,String suffix,BigDecimal amount,LocalDate date,String status) {
        jdbc.update("INSERT INTO user_email_alert_transactions(user_id,gmail_message_id,merchant,amount,transaction_date,source_bank,status) VALUES(?,?,?,?,?,?,?)",
            user,"test-"+user+"-"+suffix,"Test Merchant",amount,date,"TEST",status);
    }
}
