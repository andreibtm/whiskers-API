<div align="center">

# 🐱 Whiskers API

**The social backbone for the next generation of reading tracking.**
<br />
*Production-grade. Idempotent. Transactionally Safe.*

<p>
<img src="[https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white](https://www.google.com/search?q=https://img.shields.io/badge/Node.js-339933%3Fstyle%3Dfor-the-badge%26logo%3Dnodedotjs%26logoColor%3Dwhite)" alt="Node.js" />
<img src="[https://img.shields.io/badge/Fastify-000000?style=for-the-badge&logo=fastify&logoColor=white](https://img.shields.io/badge/Fastify-000000?style=for-the-badge&logo=fastify&logoColor=white)" alt="Fastify" />
<img src="[https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)" alt="TypeScript" />
<img src="[https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white](https://www.google.com/search?q=https://img.shields.io/badge/PostgreSQL-4169E1%3Fstyle%3Dfor-the-badge%26logo%3Dpostgresql%26logoColor%3Dwhite)" alt="PostgreSQL" />
<img src="[https://img.shields.io/badge/Prisma-2D3748?style=for-the-badge&logo=prisma&logoColor=white](https://www.google.com/search?q=https://img.shields.io/badge/Prisma-2D3748%3Fstyle%3Dfor-the-badge%26logo%3Dprisma%26logoColor%3Dwhite)" alt="Prisma" />
<img src="[https://img.shields.io/badge/Vitest-6E9F18?style=for-the-badge&logo=vitest&logoColor=white](https://www.google.com/search?q=https://img.shields.io/badge/Vitest-6E9F18%3Fstyle%3Dfor-the-badge%26logo%3Dvitest%26logoColor%3Dwhite)" alt="Vitest" />
</p>

[Philosophy](https://www.google.com/search?q=%23-the-engineering-philosophy) • [Architecture](https://www.google.com/search?q=%23-system-architecture) • [Tech Stack](https://www.google.com/search?q=%23-tech-stack) • [Setup](https://www.google.com/search?q=%23-getting-started)

</div>

---

## 📖 The Evolution

**Whiskers is evolving.**
While the original app focused on solitary, offline tracking, this API lays the foundation for a **social reading ecosystem**. It allows users to manage libraries, write posts, and share goals, but with the strict data integrity required for a production system.

> **"CRUD is easy. Managing state across time is hard."**

This is not a simple demo API. It handles the edge cases that break production apps: ensuring re-reads don't inflate goals, handling backdated sessions without breaking streaks, and scrubbing PII from social feeds.

---

## 🚀 System Architecture

We prioritize correctness over simplicity. Here are the core patterns driving the system.

### 1. The "First Finish" Rule (Idempotency)

**The Challenge:** Users often toggle book status or retry requests due to network lag, leading to inflated goal counts.
**The Solution:**

* **Logic:** On a `FINISHED` transition, we inspect existing completion timestamps.
* **Result:** We only increment the yearly goal on the **first** completion per book-year.

### 2. Smart Analytics Attribution

**The Challenge:** A session starts Jan 31st at 11:50 PM and ends Feb 1st. Who gets the credit?
**The Solution:** An **Ended-at Attribution Model**.

* Spanning sessions count once in the month they ended.
* This keeps daily totals consistent and queries performant ( vs  splitting).

### 3. Social Graph & Security

* **Zero-Trust Auth:** Payload `userId`s are ignored; identity is derived strictly from the JWT.
* **Social Safety:** PII (email/role) is scrubbed from all public feeds. Duplicate likes return `409 Conflict` to ensure data cleanliness.

---

## 🛠 Tech Stack

Designed for high performance and type safety.

| Category | Technology | Usage |
| --- | --- | --- |
| **Runtime** | **Node.js v20+** | Current LTS for stability and performance. |
| **Framework** | **Fastify** | Low overhead web framework with Zod Type-Provider for runtime validation. |
| **Language** | **TypeScript** | Strict Mode enabled for domain modeling. |
| **Database** | **PostgreSQL** | Relational data integrity. |
| **ORM** | **Prisma** | Type-safe database access and migrations. |
| **Testing** | **Vitest** | Used for E2E testing of business invariants (streaks/goals). |
| **Docs** | **OpenAPI 3.0** | Auto-generated Swagger documentation. |

---

## 📂 Domain Structure

A modular, domain-driven architecture designed for scalability.

```text
src/
├── modules/              # Domain Modules (The Core)
│   ├── analytics/        # Monthly aggregation & reporting
│   ├── auth/             # JWT handling & Registration
│   ├── books/            # State transitions & Goal hooks
│   ├── goals/            # Idempotent goal services
│   ├── posts/            # Social graph & PII scrubbing
│   └── reading-sessions/ # Streak calculation engine
└── tests/                # E2E Test Suites

```

---

## ⚡️ Getting Started

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


*Update `.env` with your `DATABASE_URL` and `JWT_SECRET` credentials.*
3. **Database Migration**
```bash
npx prisma migrate dev
npx prisma generate

```


4. **Run Server**
```bash
npm run dev

```


🚀 **Swagger UI:** `http://localhost:3000/docs`

---

## 🧪 Testing Strategy

We rely on **End-to-End (E2E)** testing to enforce business invariants rather than just unit testing implementation details.

```bash
# Run full suite
npm test

# Run specific hardening suite (Edge cases)
npx vitest run tests/streak-and-goal-hardening.e2e.test.ts

```

**Key Test Scenarios:**

* ✅ **Happy Paths:** Auth flows, session logging, goal creation.
* ⚠️ **Edge Cases:** Backdated vs Future sessions, Cross-month analytics.
* 📉 **Data Integrity:** Goal idempotency, Streak gap handling.
