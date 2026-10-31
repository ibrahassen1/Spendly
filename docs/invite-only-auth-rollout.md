# Invite-only authentication rollout (in progress)

This branch is a **security foundation**, not a finished multi-user release. Do not merge or deploy it yet.

## Before deployment

1. Create a Clerk application and configure its React/Vite publishable key and backend JWT issuer.
2. Restrict sign-ups using Clerk's invitation controls. Do **not** trust a frontend email allowlist; enforce invitations at the identity provider and server.
3. Add `spendly.auth.issuer-uri` to Spring configuration using a Railway environment variable. Do not commit secrets.
4. Add Clerk React authentication to the frontend; attach the signed-in user's bearer token to every API request.
5. Add stable owner IDs to budgets, Gmail credentials, transactions, and adjustments. Migrate the current single-user data to the correct owner with a verified, reversible migration and database backup.
6. Scope **every** query and mutation to the verified JWT subject. An authenticated user must not be able to read or change another user's data.
7. Associate Gmail OAuth state/callbacks with the authenticated user. Never share Gmail refresh tokens across users.
8. Ensure OAuth callback endpoints and preflight handling work with Spring Security; test the full sign-in, invitation, refresh, logout and Gmail flows.
9. Verify token issuer, audience and authorization claims against Clerk's current integration guidance. Test denial of missing/invalid tokens and cross-user access.
10. Test on an isolated staging backend and database before promoting to production.

**Current state:** Spring Security dependencies and a fail-closed JWT API filter have been added, but the required environment configuration, account ownership migration, frontend sign-in, invite enforcement and integration tests are **not implemented**. The production app remains unchanged.
