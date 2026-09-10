package com.spendly.backend.services;

import com.plaid.client.ApiClient;
import com.plaid.client.model.CountryCode;
import com.plaid.client.model.ItemPublicTokenExchangeRequest;
import com.plaid.client.model.ItemPublicTokenExchangeResponse;
import com.plaid.client.model.LinkTokenCreateRequest;
import com.plaid.client.model.LinkTokenCreateRequestUser;
import com.plaid.client.model.LinkTokenCreateResponse;
import com.plaid.client.model.Products;
import com.plaid.client.model.RemovedTransaction;
import com.plaid.client.model.Transaction;
import com.plaid.client.model.TransactionsRefreshRequest;
import com.plaid.client.model.TransactionsRefreshResponse;
import com.plaid.client.model.TransactionsSyncRequest;
import com.plaid.client.model.TransactionsSyncResponse;
import com.plaid.client.request.PlaidApi;
import com.spendly.backend.models.PlaidItem;
import com.spendly.backend.models.PlaidTransaction;
import com.spendly.backend.repositories.PlaidItemRepository;
import com.spendly.backend.repositories.PlaidTransactionRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import retrofit2.Response;

import java.io.IOException;
import java.math.BigDecimal;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class PlaidService {

    private final PlaidApi plaidClient;
    private final PlaidItemRepository plaidItemRepository;
    private final PlaidTransactionRepository plaidTransactionRepository;

    public PlaidService(
            @Value("${plaid.client-id}") String clientId,
            @Value("${plaid.secret}") String secret,
            PlaidItemRepository plaidItemRepository,
            PlaidTransactionRepository plaidTransactionRepository
    ) {
        this.plaidItemRepository = plaidItemRepository;
        this.plaidTransactionRepository = plaidTransactionRepository;

        Map<String, String> apiKeys = new HashMap<>();
        apiKeys.put("clientId", clientId);
        apiKeys.put("secret", secret);

        ApiClient apiClient = new ApiClient(apiKeys);
        apiClient.setPlaidAdapter(ApiClient.Production);

        this.plaidClient = apiClient.createService(PlaidApi.class);
    }

    public String createLinkToken() throws IOException {
        LinkTokenCreateRequest request = new LinkTokenCreateRequest()
                .user(
                        new LinkTokenCreateRequestUser()
                                .clientUserId("spendly-user")
                )
                .clientName("Spendly")
                .products(Arrays.asList(Products.TRANSACTIONS))
                .countryCodes(Arrays.asList(CountryCode.US))
                .language("en");

        Response<LinkTokenCreateResponse> response =
                plaidClient.linkTokenCreate(request).execute();

        if (!response.isSuccessful() || response.body() == null) {
            throw new RuntimeException(
                    "Failed to create Plaid Link token: " + getError(response)
            );
        }

        return response.body().getLinkToken();
    }

    public void exchangePublicToken(String publicToken) throws IOException {
        ItemPublicTokenExchangeRequest request =
                new ItemPublicTokenExchangeRequest()
                        .publicToken(publicToken);

        Response<ItemPublicTokenExchangeResponse> response =
                plaidClient.itemPublicTokenExchange(request).execute();

        if (!response.isSuccessful() || response.body() == null) {
            throw new RuntimeException(
                    "Failed to exchange Plaid public token: " + getError(response)
            );
        }

        PlaidItem plaidItem = new PlaidItem();
        plaidItem.setAccessToken(response.body().getAccessToken());
        plaidItem.setCursor(null);

        plaidItemRepository.save(plaidItem);
    }

    @Transactional
    public int syncTransactions() throws IOException {
        PlaidItem plaidItem = getPlaidItem();

        String cursor = plaidItem.getCursor();
        boolean hasMore = true;
        int changesProcessed = 0;

        while (hasMore) {
            TransactionsSyncRequest request =
                    new TransactionsSyncRequest()
                            .accessToken(plaidItem.getAccessToken());

            if (cursor != null && !cursor.isBlank()) {
                request.cursor(cursor);
            }

            Response<TransactionsSyncResponse> response =
                    plaidClient.transactionsSync(request).execute();

            if (!response.isSuccessful() || response.body() == null) {
                throw new RuntimeException(
                        "Failed to sync Plaid transactions: " + getError(response)
                );
            }

            TransactionsSyncResponse body = response.body();

            for (Transaction transaction : body.getAdded()) {
                upsertTransaction(transaction);
                changesProcessed++;
            }

            for (Transaction transaction : body.getModified()) {
                upsertTransaction(transaction);
                changesProcessed++;
            }

            for (RemovedTransaction removed : body.getRemoved()) {
                plaidTransactionRepository
                        .findByPlaidTransactionId(removed.getTransactionId())
                        .ifPresent(plaidTransactionRepository::delete);

                changesProcessed++;
            }

            cursor = body.getNextCursor();
            hasMore = Boolean.TRUE.equals(body.getHasMore());
        }

        plaidItem.setCursor(cursor);
        plaidItemRepository.save(plaidItem);

        return changesProcessed;
    }

    public List<PlaidTransaction> getTransactions() {
        return plaidTransactionRepository.findAllByOrderByTransactionDateDesc();
    }

    public void refreshTransactions() throws IOException {
        PlaidItem plaidItem = getPlaidItem();

        TransactionsRefreshRequest request =
                new TransactionsRefreshRequest()
                        .accessToken(plaidItem.getAccessToken());

        Response<TransactionsRefreshResponse> response =
                plaidClient.transactionsRefresh(request).execute();

        if (!response.isSuccessful()) {
            throw new RuntimeException(
                    "Failed to refresh Plaid transactions: " + getError(response)
            );
        }
    }

    private void upsertTransaction(Transaction transaction) {
        PlaidTransaction savedTransaction =
                plaidTransactionRepository
                        .findByPlaidTransactionId(transaction.getTransactionId())
                        .orElseGet(PlaidTransaction::new);

        savedTransaction.setPlaidTransactionId(
                transaction.getTransactionId()
        );

        String merchant = transaction.getMerchantName();

        if (merchant == null || merchant.isBlank()) {
            merchant = transaction.getName();
        }

        savedTransaction.setMerchant(merchant);

        savedTransaction.setAmount(
                BigDecimal.valueOf(transaction.getAmount())
        );

        savedTransaction.setTransactionDate(
                transaction.getDate()
        );

        savedTransaction.setPending(
                Boolean.TRUE.equals(transaction.getPending())
        );

        if (transaction.getCategory() != null) {
            savedTransaction.setCategory(
                    String.join(" > ", transaction.getCategory())
            );
        } else {
            savedTransaction.setCategory(null);
        }

        plaidTransactionRepository.save(savedTransaction);
    }

    private PlaidItem getPlaidItem() {
        return plaidItemRepository
                .findAll()
                .stream()
                .findFirst()
                .orElseThrow(
                        () -> new RuntimeException(
                                "No Plaid account connected"
                        )
                );
    }

    private String getError(Response<?> response) throws IOException {
        if (response.errorBody() != null) {
            return response.errorBody().string();
        }

        return "Unknown Plaid error";
    }
}
