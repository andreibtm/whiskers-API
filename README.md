#

# 📚 Whiskers API

# A production-grade REST API for tracking reading habits, calculating streaks, and managing social reading goals. Built with strict adherence to idempotency, transactional integrity, and security-first principles.

## 🚀 The "Why" & The "What"

Unlike simple CRUD apps, Whiskers API manages complex state transitions. It ensures that a user who re-reads a book does not trigger duplicate goal completions, and that analytics remain accurate even across timezones.

## Key Features

- Authentication-First Access: Every non-public route derives identity from JWT; client-supplied userId is ignored, and ownership gates protect books, sessions, goals, posts, and progress.
- State-Machine Book Lifecycle: NOT_STARTED → READING → FINISHED with safe reopen; ownership is immutable.
- Idempotent Goal Tracking: Only the first FINISHED transition per book per year increments yearly goals; re-finishing never double-counts.
- Effective-Date Analytics: Sessions bucket on effectiveDate = endedAt ?? startedAt; spanning sessions attribute to endedAt month with consistent daily totals.
- Streak Integrity with Backfills: Calendar-day streaks increment once per day, ignore older backdated sessions for streak math, and reject future dates.
- Social Graph with Safety: Posts, likes, comments, and feed honor follows, conflict on duplicate likes (409), and scrub PII from public payloads.
- Standardized Errors: All error responses use `{ error: { code, message } }` with correct status codes (400/401/403/404/409).
- OpenAPI Coverage: Swagger documents routes, bodies, responses, error shapes, pagination, and business notes (analytics policy).

## Architecture Highlights

- Re-finish Does Not Double Count: Book updates detect the first FINISHED transition and persist completion timestamps; yearly goal increments occur only on that first completion, while reopen/refix keeps goals stable. Progress records mirror the first completion, preventing goal drift during status toggles or retries.
- Streak Backdating Logic: Streaks are computed on UTC calendar days from effectiveDate. Backdated sessions earlier than the lastReadDay are ignored for streak math (they still count in analytics), and future-dated sessions are rejected. We persist the real endedAt timestamp for lastReadDate while normalizing day boundaries for gap detection.

## Project Structure

```
src/
├── app.ts                # Fastify setup, plugins, global error envelope
├── routes.ts             # Registers module routes
├── lib/
│   ├── auth.ts           # JWT helpers, public profile mapper
│   ├── pagination.ts     # parsePagination + meta helpers
│   ├── prisma.ts         # Prisma client
│   └── schemas.ts        # Shared error schema { error: { code, message } }
├── modules/
│   ├── analytics/        # Summary + monthly routes and schemas
│   ├── auth/             # Register/login/refresh/me routes
│   ├── books/            # Book CRUD, status transitions, goal hooks
│   ├── feed/             # Feed aggregation and pagination
│   ├── goals/            # Goal routes and idempotent services
│   ├── notes/            # Book notes routes
│   ├── posts/            # Posts, likes, comments, likedByMe mapping
│   ├── progress/         # Progress upsert per book
│   ├── reading-sessions/ # Session creation/listing, streak services
│   └── users/            # Follows and admin listing
└── tests/                # Vitest + Supertest E2E suites (auth, analytics, streak/goals, social, negative paths)
```

## Environment Variables

| Name               | Description                       | Default     |
| ------------------ | --------------------------------- | ----------- |
| DATABASE_URL       | PostgreSQL connection string      | (required)  |
| JWT_SECRET         | Access token secret (>=32 chars)  | (required)  |
| JWT_REFRESH_SECRET | Refresh token secret (>=32 chars) | (required)  |
| PORT               | Server port                       | 3000        |
| NODE_ENV           | Environment mode                  | development |

## 🛠 Tech Stack

- Runtime: Node.js v20+
- Language: TypeScript (strict)
- Framework: Fastify + Zod type-provider
- Database: PostgreSQL
- ORM: Prisma
- Testing: Vitest + Supertest (E2E)
- Docs: OpenAPI 3 (Swagger)

## 🏗 Architecture & Design Decisions

1. The "First Finish" Rule (Goals)

   - Logic: On FINISHED transition, we inspect existing completion timestamps and only increment the yearly goal on the first completion per book-year. Reopens clear book.finishedAt but do not re-increment goals.
   - Result: Idempotent goals resilient to status toggles and retries.

2. Analytics Attribution

   - Decision: Ended-at attribution model for monthly reporting with effectiveDate = endedAt ?? startedAt; spanning sessions count once in the month of endedAt, with daily breakdowns aligned to effective dates.

3. Security by Default
   - Zero-Trust Auth: userId fields in payloads are ignored; ownership checks guard all resources. Error responses are standardized with codes and messages.
   - PII Guardrails: Public surfaces (posts/feed) omit email/password/role and include likedByMe scoped to the caller.

## 📖 API Documentation

- Swagger UI available at `/docs` (requires server running).
- Protected endpoints need `Authorization: Bearer <accessToken>`.

## ⚡️ Quick Start

Prerequisites: Node.js v20+, npm, PostgreSQL (local or Docker).

```bash
git clone https://github.com/your-username/whiskers-api.git
cd whiskers-API
cp .env.example .env
npm install

# Set DATABASE_URL, JWT_SECRET, JWT_REFRESH_SECRET in .env

npx prisma migrate dev
npx prisma generate
npm run dev
# Swagger at http://localhost:3000/docs
```

## 🧪 Testing Strategy

The suite is E2E-heavy to enforce business invariants and security.

```bash
# Run all tests
npm test

# Example: run streak/goals suite
npx vitest run tests/streak-and-goal-hardening.e2e.test.ts
```

What we test:

- Happy paths: auth, books, sessions, goals, social feed.
- Edge cases: backdated vs future sessions, cross-month analytics, duplicate likes, duplicate goals.
- Security: unauthorized/forbidden access, admin boundary checks, PII stripping on feed/posts.
- Data integrity: goal idempotency, streak gap handling, ownership on sessions/books/progress.
