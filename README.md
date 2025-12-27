# 📚 Whiskers API

A **production-grade REST API** for tracking reading habits, calculating streaks, and managing social reading goals. Built with strict adherence to **idempotency**, **transactional integrity**, and **security-first** principles.

---

## 🚀 The "Why" & The "What"

> **"CRUD is easy. Managing state across time is hard."**

Unlike simple demo apps, Whiskers API manages complex state transitions. It handles the edge cases that break production apps: ensuring a user who re-reads a book doesn't accidentally trigger duplicate goal completions, and ensuring analytics remain accurate even when users backdate sessions.

### ✨ Key Features at a Glance

| Feature | Description |
| --- | --- |
| 🔐 **Auth-First Access** | Identity is derived strictly from **JWT**. Client-supplied IDs are ignored. Ownership gates protect all resources. |
| 🔄 **State Machine** | Strict lifecycle: `NOT_STARTED` → `READING` → `FINISHED`. Includes safe reopen logic. |
| 🎯 **Idempotent Goals** | Re-finishing a book **never double-counts**. Only the first transition increments yearly goals. |
| 📊 **Smart Analytics** | Sessions are bucketed by *Effective Date*. Spanning sessions attribute logically to maintain consistent totals. |
| 🔥 **Streak Integrity** | Handles backdated sessions without breaking math. Ignores future dates. 100% Calendar-day accurate. |
| 🛡️ **Social Safety** | PII (email/role) is scrubbed from all public feeds. Duplicate likes return `409 Conflict`. |

---

## 🏗 Architecture & Engineering Decisions

This section outlines the specific design patterns used to solve common distributed system problems.

### 1. The "First Finish" Rule (Idempotency)

**The Challenge:** Users often toggle book status or retry requests due to network lag. In a naive implementation, this leads to inflated goal counts.
**The Solution:**

* **Logic:** On a `FINISHED` transition, we inspect existing completion timestamps. We only increment the yearly goal on the *first* completion per book-year.
* **Result:** Reopening a book clears `finishedAt` but does *not* re-increment goals. System is resilient to retries.

### 2. Analytics Attribution Model

**The Challenge:** A reading session starts on Jan 31st at 11:50 PM and ends Feb 1st at 12:20 AM. Which month gets the credit?
**The Decision:** We use an **Ended-at Attribution Model**.

* `effectiveDate` = `endedAt` ?? `startedAt`.
* Spanning sessions count once in the month they ended, keeping daily totals consistent and queries performant (O(1) vs O(n) splitting).

### 3. Security by Default

* **Zero-Trust Auth:** Payload `userId`s are ignored; `req.user.id` from the token is the source of truth.
* **Standardized Errors:** No leaking stack traces. All errors follow `{ error: { code, message } }`.

---

## 🛠 Tech Stack

* **Runtime:** Node.js v20+
* **Language:** TypeScript (Strict Mode)
* **Framework:** Fastify (w/ Zod Type-Provider for runtime validation)
* **Database:** PostgreSQL
* **ORM:** Prisma
* **Testing:** Vitest + Supertest (E2E)
* **Documentation:** OpenAPI 3.0 (Swagger)

---

## 📂 Project Structure

A modular, domain-driven architecture designed for scalability.

```text
src/
├── app.ts                # Fastify setup, global error envelope
├── modules/              # Domain Modules (The Core)
│   ├── analytics/        # Monthly aggregation & reporting
│   ├── auth/             # JWT handling & Registration
│   ├── books/            # State transitions & Goal hooks
│   ├── goals/            # Idempotent goal services
│   ├── posts/            # Social graph & PII scrubbing
│   └── reading-sessions/ # Streak calculation engine
├── lib/
│   ├── auth.ts           # Security helpers
│   └── prisma.ts         # DB Client
└── tests/                # E2E Test Suites

```

---

## ⚡️ Quick Start

### Prerequisites

* Node.js v20+
* PostgreSQL (Local or Docker)

### Installation

1. **Clone and Install**
```bash
git clone https://github.com/your-username/whiskers-api.git
cd whiskers-api
npm install

```


2. **Environment Setup**
```bash
cp .env.example .env

```


*Update `.env` with your credentials:*
| Variable | Description |
| :--- | :--- |
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Access token secret (>32 chars) |
| `JWT_REFRESH_SECRET` | Refresh token secret |
3. **Database Migration**
```bash
npx prisma migrate dev
npx prisma generate

```


4. **Run Development Server**
```bash
npm run dev

```


🚀 **Swagger UI:** `http://localhost:3000/docs`

---

## 🧪 Testing Strategy

We prioritize **End-to-End (E2E)** testing to enforce business invariants rather than just unit testing implementation details.

```bash
# Run full suite
npm test

# Run specific hardening suite
npx vitest run tests/streak-and-goal-hardening.e2e.test.ts

```

**What we test:**

* ✅ **Happy Paths:** Auth flows, session logging, goal creation.
* ⚠️ **Edge Cases:** Backdated vs Future sessions, Cross-month analytics.
* 🔒 **Security:** Admin boundary checks, PII stripping, Ownership validation.
* 📉 **Data Integrity:** Goal idempotency, Streak gap handling.

---

## 📖 API Documentation

Complete API documentation is auto-generated via Swagger.

* **Public Routes:** `/auth/*`, `/feed` (read-only)
* **Protected Routes:** Require `Authorization: Bearer <token>`
