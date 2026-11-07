# Spendly v1 release checklist

**Do not merge or deploy until the CI jobs pass and a database backup exists.**

## Required hosting settings

Vercel frontend (build-time environment):
- `VITE_SPENDLY_API_URL`: HTTPS URL of the deployed Railway backend (no trailing /api).
- `VITE_CLERK_PUBLISHABLE_KEY`: publishable key for the Clerk application serving this frontend. Ensure that its JWT issuer matches the backend.

Railway backend (runtime environment):
- `SPRING_DATASOURCE_URL`: `jdbc:postgresql://HOST:PORT/DB` for the existing Railway PostgreSQL database; **do not point this at a new empty database unless deliberately migrating**.
- `SPRING_DATASOURCE_USERNAME`, `SPRING_DATASOURCE_PASSWORD`: credentials for that database.
- `SPENDLY_AUTH_ISSUER_URI`: issuer for the same Clerk instance as the Vercel publishable key.
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`: Google OAuth credentials.
- `GOOGLE_REDIRECT_URI`: `https://YOUR-BACKEND-HOST/api/account/gmail/callback` and EXACTLY the same URI in Google Cloud Console.
- `SPENDLY_GMAIL_TOKEN_ENCRYPTION_KEY`: existing 32-byte base64-encoded AES key. **Re-use the key that encrypted current stored Gmail connections; changing it makes refresh tokens unreadable.**
- `SPENDLY_ALLOWED_ORIGINS`: comma-separated, exact HTTPS frontend origins (e.g. the production Vercel URL). No wildcard or trailing slash.

Railway should run the Spring Boot backend from the `backend` project directory. Vercel should build from `frontend` with `npm run build` and publish `dist`. Verify hosting project build roots and commands before changing the production deployment.

## Before deploying

1. Back up the **current production PostgreSQL database** using Railway/PostgreSQL backup tools. Keep backup outside the application; record a recovery plan and test restore into an isolated database if possible.
2. Check current `flyway_schema_history`. Migrations `V99` through `V103` introduce account-scoped tables. They must not modify existing shared financial records. Verify against a restored snapshot before applying to production. Confirm Flyway validation passes.
3. Run the GitHub Actions frontend build and backend tests. Review the release PR and audit all user-scoped financial endpoints.
4. Decide how to handle existing single-user production data. **This release does not automatically convert shared records to Clerk-user-owned records.** Back them up and plan an explicit migration if they must appear in the new accounts.
5. Verify Clerk production domain and sign-in configuration, and Google OAuth app publishing/test-user access for both intended accounts. Ensure the Google consent screen and privacy policy meet requirements for Gmail read-only scope.
6. Confirm CORS allows only the intended Vercel origin.

## Release smoke test

After a controlled deployment, sign in as user A and user B on the production hostname. Verify independent Gmail connections; sync and confirm deduplication; check balances, start dates, and transactions; perform positive/negative Add Money once per account, and confirm the other account is unchanged; test exclude/restore; check that unauthenticated account API calls fail and legacy shared API endpoints remain blocked.

## Rollback

Keep the pre-release frontend and backend deployment identifiers. If checks fail, roll back both applications together. **Do not blindly reverse Flyway migrations or delete new tables**; restore the verified database backup only under an explicit incident recovery plan. A rollback of application code alone may not restore compatibility with new schema changes.

## Feature workflow after launch

Once production smoke tests pass, tag the release (e.g. `v1.0.0`). Keep `main` deployable; create `develop` or independent `feature/*` branches for new work and merge via tested PRs.
