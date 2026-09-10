package com.spendly.backend.services;

import com.plaid.client.ApiClient;
import com.plaid.client.request.PlaidApi;
import com.plaid.client.model.CountryCode;
import com.plaid.client.model.ItemPublicTokenExchangeRequest;
import com.plaid.client.model.ItemPublicTokenExchangeResponse;
import com.plaid.client.model.LinkTokenCreateRequest;
import com.plaid.client.model.LinkTokenCreateRequestUser;
import com.plaid.client.model.LinkTokenCreateResponse;
import com.plaid.client.model.Products;
import com.spendly.backend.models.PlaidItem;
import com.spendly.backend.repositories.PlaidItemRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import retrofit2.Response;

import java.io.IOException;
import java.util.Arrays;
import java.util.HashMap;
import java.util.Map;

@Service
public class PlaidService {

    private final PlaidApi plaidClient;
    private final PlaidItemRepository plaidItemRepository;

    public PlaidService(
            @Value("${plaid.client-id}") String clientId,
            @Value("${plaid.secret}") String secret,
            PlaidItemRepository plaidItemRepository
    ) {
        this.plaidItemRepository = plaidItemRepository;

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
            String error = response.errorBody() != null
                    ? response.errorBody().string()
                    : "Unknown Plaid error";

            throw new RuntimeException(
                    "Failed to create Plaid Link token: " + error
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
            String error = response.errorBody() != null
                    ? response.errorBody().string()
                    : "Unknown Plaid error";

            throw new RuntimeException(
                    "Failed to exchange Plaid public token: " + error
            );
        }

        String accessToken = response.body().getAccessToken();

        PlaidItem plaidItem = new PlaidItem();
        plaidItem.setAccessToken(accessToken);
        plaidItem.setCursor(null);

        plaidItemRepository.save(plaidItem);
    }
}
