import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { resetDatabase } from "./utils/reset-db.js";

const clearDatabase = async () => {
  await prisma.like.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.post.deleteMany();
  await prisma.readingSession.deleteMany();
  await prisma.readingGoal.deleteMany();
  await prisma.readingStreak.deleteMany();
  await prisma.progress.deleteMany();
  await prisma.note.deleteMany();
  await prisma.book.deleteMany();
  await prisma.userFollow.deleteMany();
  await prisma.user.deleteMany();
};

describe("analytics month bucketing", () => {
  const app = buildApp();

  beforeAll(async () => {
    await app.ready();
    await clearDatabase();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it("counts cross-month sessions in the overlapping month", async () => {
    vi.useFakeTimers();
    const fixedNow = new Date("2023-03-02T12:00:00Z");
    vi.setSystemTime(fixedNow);

    try {
      const user = await request(app.server).post("/auth/register").send({ email: "analytics@example.com", password: "password123" }).expect(201);
      const token = user.body.accessToken as string;

      const startOfMonth = new Date(Date.UTC(2023, 1, 1)); // Feb 1, 2023
      const startOfNextMonth = new Date(Date.UTC(2023, 2, 1)); // Mar 1, 2023
      const endOfPrevMonth = new Date(Date.UTC(2023, 0, 31)); // Jan 31, 2023

      // Session starts end of previous month, ends start of this month — should appear in this month.
      await request(app.server)
        .post("/sessions")
        .set("Authorization", `Bearer ${token}`)
        .send({
          type: "FREE",
          durationMinutes: 30,
          pagesRead: 10,
          startedAt: new Date(Date.UTC(endOfPrevMonth.getUTCFullYear(), endOfPrevMonth.getUTCMonth(), endOfPrevMonth.getUTCDate(), 23, 0)).toISOString(),
          endedAt: new Date(Date.UTC(startOfMonth.getUTCFullYear(), startOfMonth.getUTCMonth(), startOfMonth.getUTCDate(), 0, 30)).toISOString(),
        })
        .expect(201);

      // Session starts late this month, ends early next month — should count for this month and be visible next month via end.
      await request(app.server)
        .post("/sessions")
        .set("Authorization", `Bearer ${token}`)
        .send({
          type: "FREE",
          durationMinutes: 40,
          pagesRead: 12,
          startedAt: new Date(Date.UTC(startOfNextMonth.getUTCFullYear(), startOfNextMonth.getUTCMonth(), 0, 22, 0)).toISOString(),
          endedAt: new Date(Date.UTC(startOfNextMonth.getUTCFullYear(), startOfNextMonth.getUTCMonth(), 1, 0, 0)).toISOString(),
        })
        .expect(201);

      const thisMonth = await request(app.server)
        .get(`/analytics/monthly?year=${startOfMonth.getUTCFullYear()}&month=${startOfMonth.getUTCMonth() + 1}`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(thisMonth.body.sessionCount).toBe(2);
      expect(thisMonth.body.totalPagesRead).toBe(22);

      const nextMonth = await request(app.server)
        .get(`/analytics/monthly?year=${startOfNextMonth.getUTCFullYear()}&month=${startOfNextMonth.getUTCMonth() + 1}`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(nextMonth.body.sessionCount).toBe(1);
      expect(nextMonth.body.totalPagesRead).toBe(12);
    } finally {
      vi.useRealTimers();
    }
  });

  it("splits pages and minutes across days for a multi-day session", async () => {
    const user = await request(app.server)
      .post("/auth/register")
      .send({ email: "split@example.com", password: "password123" })
      .expect(201);

    const token = user.body.accessToken as string;

    await request(app.server)
      .post("/sessions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "FREE",
        durationMinutes: 60,
        pagesRead: 60,
        startedAt: "2023-10-31T23:30:00.000Z",
        endedAt: "2023-11-01T00:30:00.000Z",
      })
      .expect(201);

    const october = await request(app.server)
      .get("/analytics/monthly?year=2023&month=10")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const oct31 = october.body.days.find((d: any) => d.date === "2023-10-31");
    expect(oct31).toBeTruthy();
    expect(oct31.minutesRead).toBe(30);
    expect(oct31.pagesRead).toBe(30);
    expect(oct31.sessionCount).toBe(1);

    const november = await request(app.server)
      .get("/analytics/monthly?year=2023&month=11")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const nov1 = november.body.days.find((d: any) => d.date === "2023-11-01");
    expect(nov1).toBeTruthy();
    expect(nov1.minutesRead).toBe(30);
    expect(nov1.pagesRead).toBe(30);
    expect(nov1.sessionCount).toBe(1);
  });

  it("distributes pages proportionally across three days without losing totals", async () => {
    const user = await request(app.server)
      .post("/auth/register")
      .send({ email: "stress@example.com", password: "password123" })
      .expect(201);

    const token = user.body.accessToken as string;

    await request(app.server)
      .post("/sessions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "FREE",
        durationMinutes: 120, // 10 + 100 + 10
        pagesRead: 13,
        startedAt: "2023-11-10T23:50:00.000Z", // 10 minutes on Nov 10
        endedAt: "2023-11-12T00:10:00.000Z", // 10 minutes into Nov 12
      })
      .expect(201);

    const november = await request(app.server)
      .get("/analytics/monthly?year=2023&month=11")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const day1 = november.body.days.find((d: any) => d.date === "2023-11-10");
    const day2 = november.body.days.find((d: any) => d.date === "2023-11-11");
    const day3 = november.body.days.find((d: any) => d.date === "2023-11-12");

    expect(day1).toBeTruthy();
    expect(day2).toBeTruthy();
    expect(day3).toBeTruthy();

    expect(day1.minutesRead).toBe(10);
    expect(day2.minutesRead).toBe(100);
    expect(day3.minutesRead).toBe(10);

    const totalPages = (day1.pagesRead ?? 0) + (day2.pagesRead ?? 0) + (day3.pagesRead ?? 0);
    expect(totalPages).toBe(13);

    expect(day2.pagesRead).toBeGreaterThanOrEqual(11);
    expect(day1.pagesRead).toBeGreaterThanOrEqual(1);
    expect(day3.pagesRead).toBeGreaterThanOrEqual(1);
  });

  it("handles an active timer crossing month boundary", async () => {
    vi.useFakeTimers();
    const now = new Date("2023-11-01T00:40:00.000Z");
    vi.setSystemTime(now);

    try {
      const user = await request(app.server)
        .post("/auth/register")
        .send({ email: "active-timer@example.com", password: "password123" })
        .expect(201);

      const token = user.body.accessToken as string;

      await request(app.server)
        .post("/sessions")
        .set("Authorization", `Bearer ${token}`)
        .send({
          type: "FREE",
          durationMinutes: 60,
          pagesRead: 20,
          startedAt: "2023-10-31T23:30:00.000Z",
          endedAt: null,
        })
        .expect(201);

      const october = await request(app.server)
        .get("/analytics/monthly?year=2023&month=10")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      const oct31 = october.body.days.find((d: any) => d.date === "2023-10-31");
      expect(oct31).toBeTruthy();
      expect(oct31.minutesRead).toBe(30);
      expect(oct31.pagesRead).toBe(10);
      expect(oct31.sessionCount).toBe(1);

      const november = await request(app.server)
        .get("/analytics/monthly?year=2023&month=11")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      const nov1 = november.body.days.find((d: any) => d.date === "2023-11-01");
      expect(nov1).toBeTruthy();
      expect(nov1.minutesRead).toBe(30);
      expect(nov1.pagesRead).toBe(10);
      expect(nov1.sessionCount).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
