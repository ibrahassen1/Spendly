# Spendly

> Your bank tells you your balance. Spendly tells you what you can actually spend.

Spendly is a mobile-first personal finance application that automatically tracks credit card purchases and calculates how much money is actually safe to spend.

Instead of treating available credit or a checking account balance as spendable money, Spendly maintains a user-defined spending allocation and automatically reduces it as new card purchases are detected.

## Why Spendly?

Credit cards make it easy to lose track of how much money has actually been spent.

A bank might show:

- your checking account balance
- your credit card balance
- your available credit

But none of those directly answer:

**"How much money can I safely spend right now?"**

Spendly is built around answering that question.

## How It Works

```text
Card Purchase
     ↓
Bank Transaction Alert
     ↓
Gmail
     ↓
Gmail API
     ↓
Spring Boot Backend
     ↓
Bank-Specific Parser
     ↓
Normalize + Deduplicate Transaction
     ↓
PostgreSQL
     ↓
Safe-to-Spend Calculation
     ↓
React PWA
```

When the user presses **Refresh Transactions**, Spendly:

1. Searches Gmail for supported bank transaction alerts.
2. Determines which bank sent each alert.
3. Parses the transaction amount, merchant, date, card, and timestamp.
4. Normalizes different bank email formats into a common transaction model.
5. Deduplicates transactions using the Gmail message ID.
6. Stores new transactions in PostgreSQL.
7. Recalculates the user's Safe-to-Spend balance.
8. Updates the transaction ledger.

## Features

### Safe to Spend

Users define a spending allocation and start date.

Spendly calculates:

```text
Safe to Spend = Spending Allocation - Purchases Since Start Date
```

Only transactions on or after the selected start date count toward the current spending period.

### Automatic Transaction Ingestion

Spendly uses the Gmail API to detect real transaction-alert emails instead of requiring users to manually enter every purchase.

Currently supported:

- Wells Fargo
- Discover

Each bank has its own parser while transactions are normalized into the same internal data model.

### Transaction Deduplication

Every processed Gmail message is stored using its unique Gmail message ID.

This prevents the same purchase alert from reducing Safe-to-Spend multiple times during future refreshes.

### Budget Adjustments

Users can:

- create a spending allocation
- change their spending period
- add money
- subtract money
- use negative spending allocations

Adjustments preserve the current spending-period start date unless the user explicitly changes it.

### Current-Period Ledger

Spendly displays purchases from the active spending period with:

- merchant
- amount
- transaction date
- transaction time
- card ending
- source bank

### Mobile PWA

Spendly is built as a Progressive Web App and can be installed directly from Safari onto an iPhone Home Screen.

The application supports:

- standalone display
- custom home-screen icon
- mobile-first interface
- PWA manifest
- service worker
- dark-mode finance UI

## Tech Stack

### Backend

- Java 21
- Spring Boot
- Spring Data JPA
- Hibernate
- Maven
- Gmail API
- Google OAuth 2.0
- Flyway

### Frontend

- React
- Vite
- JavaScript
- CSS
- Progressive Web App

### Database

- PostgreSQL
- Docker for local development
- Flyway database migrations

### Deployment

- Railway — Spring Boot API and PostgreSQL
- Vercel — React frontend

## Architecture

```text
┌─────────────────────────────┐
│       Wells Fargo           │
│       Discover              │
└──────────────┬──────────────┘
               │
               │ Transaction alerts
               ▼
┌─────────────────────────────┐
│            Gmail            │
└──────────────┬──────────────┘
               │
               │ Gmail API / OAuth 2.0
               ▼
┌─────────────────────────────┐
│     Spring Boot Backend     │
│                             │
│  GmailService               │
│        │                    │
│        ▼                    │
│  Bank Parser Routing        │
│    ├── Wells Fargo          │
│    └── Discover             │
│        │                    │
│        ▼                    │
│  Normalized Transaction     │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│         PostgreSQL          │
│                             │
│  Transactions               │
│  Spending Allocations       │
│  Gmail Credentials          │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│    Safe-to-Spend Service    │
└──────────────┬──────────────┘
               │
               │ REST API
               ▼
┌─────────────────────────────┐
│       React PWA             │
│                             │
│  Safe to Spend              │
│  Recent Activity            │
│  Budget Controls            │
└─────────────────────────────┘
```

## Database Migrations

Spendly uses Flyway to version and manage the PostgreSQL schema.

Current migrations cover:

- initial Spendly tables
- email alert transactions
- Gmail OAuth credentials
- transaction timestamps
- transaction source bank

This allows the same schema changes to be applied consistently in local development and production.

## Local Development

### Prerequisites

- Java 21
- Node.js
- Docker
- Maven

### Start PostgreSQL

From the project root:

```bash
docker compose up -d
```

### Start the Backend

```bash
cd backend
./mvnw spring-boot:run
```

The backend runs on:

```text
http://localhost:8080
```

### Start the Frontend

In another terminal:

```bash
cd frontend
npm install
npm run dev
```

## Project Structure

```text
Spendly/
├── backend/
│   ├── src/
│   ├── pom.xml
│   └── mvnw
│
├── frontend/
│   ├── public/
│   ├── src/
│   ├── package.json
│   └── vite.config.js
│
├── docs/
├── docker-compose.yml
└── README.md
```

## Current Status

Spendly is deployed and functional.

The current end-to-end flow is:

```text
Real card purchase
      ↓
Bank email alert
      ↓
Gmail API
      ↓
Spendly backend
      ↓
PostgreSQL
      ↓
Safe-to-Spend recalculation
      ↓
Mobile PWA
```

## Future Improvements

Potential future work includes:

- additional bank integrations
- automatic background transaction synchronization
- improved duplicate detection across multiple alerts for the same purchase
- Gmail credential encryption
- transaction categorization
- spending analytics
- recurring expense detection
- removal of legacy Plaid integration
- native iOS distribution

## Motivation

Spendly started from a simple personal problem: credit cards make it difficult to understand how much money is truly available to spend.

The goal is to provide one number that is more useful than an account balance:

**Safe to Spend.**
