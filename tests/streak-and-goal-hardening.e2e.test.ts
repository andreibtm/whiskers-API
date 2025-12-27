import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

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

describe("streak and goal hardening", () => {
  const app = buildApp();

  beforeAll(async () => {
    await app.ready();
    await clearDatabase();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it("rejects future or overly backdated session dates for streaks", async () => {
    const user = await request(app.server).post("/auth/register").send({ email: "streak-guard@example.com", password: "password123" }).expect(201);
    const token = user.body.accessToken as string;

    const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await request(app.server)
      .post("/sessions")
      .set("Authorization", `Bearer ${token}`)
      .send({ type: "POMODORO", durationMinutes: 10, pagesRead: 5, startedAt: futureDate })
      .expect(400);

    const thirtyOneDaysAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    await request(app.server)
      .post("/sessions")
      .set("Authorization", `Bearer ${token}`)
      .send({ type: "POMODORO", durationMinutes: 10, pagesRead: 5, startedAt: thirtyOneDaysAgo })
      .expect(400);
  });

  it("keeps yearly goal completion idempotent when reopening books", async () => {
    const user = await request(app.server).post("/auth/register").send({ email: "goal-idem@example.com", password: "password123" }).expect(201);
    const token = user.body.accessToken as string;
    const userId = user.body.user.id as string;

    const book = await request(app.server)
      .post("/books")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Idempotent", author: "Author", totalPages: 50 })
      .expect(201);

    const year = new Date().getUTCFullYear();
    await request(app.server)
      .post("/goals")
      .set("Authorization", `Bearer ${token}`)
      .send({ year, targetBooks: 1 })
      .expect(201);

    await request(app.server)
      .put(`/books/${book.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "FINISHED" })
      .expect(200);

    const goalAfterFinish = await request(app.server)
      .get(`/goals/${year}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(goalAfterFinish.body.completedBooks).toBe(1);

    await request(app.server)
      .put(`/books/${book.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "READING" })
      .expect(200);

    const goalAfterReopen = await request(app.server)
      .get(`/goals/${year}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(goalAfterReopen.body.completedBooks).toBe(1);

    await request(app.server)
      .put(`/books/${book.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "FINISHED" })
      .expect(200);

    const goalAfterRefinish = await request(app.server)
      .get(`/goals/${year}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(goalAfterRefinish.body.completedBooks).toBe(1);

    const streak = await prisma.readingStreak.findUnique({ where: { userId } });
    expect(streak?.currentStreak ?? 0).toBeGreaterThanOrEqual(0);
  });

  it("does not regress streak when adding older sessions and enforces endedAt ordering", async () => {
    const user = await request(app.server).post("/auth/register").send({ email: "streak-order@example.com", password: "password123" }).expect(201);
    const token = user.body.accessToken as string;

    const now = new Date();
    const day2Date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1, 12, 0));
    const day1Date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 2, 12, 0));
    const day2 = day2Date.toISOString();
    const day1 = day1Date.toISOString();

    await request(app.server)
      .post("/sessions")
      .set("Authorization", `Bearer ${token}`)
      .send({ type: "FREE", durationMinutes: 20, pagesRead: 5, startedAt: day2 })
      .expect(201);

    const streakAfterDay2 = await prisma.readingStreak.findFirstOrThrow({ where: { userId: user.body.user.id } });
    expect(streakAfterDay2.currentStreak).toBeGreaterThanOrEqual(1);

    await request(app.server)
      .post("/sessions")
      .set("Authorization", `Bearer ${token}`)
      .send({ type: "FREE", durationMinutes: 10, pagesRead: 2, startedAt: day1 })
      .expect(201);

    const streakAfterBackfill = await prisma.readingStreak.findFirstOrThrow({ where: { userId: user.body.user.id } });
    expect(streakAfterBackfill.currentStreak).toBe(streakAfterDay2.currentStreak);
    expect(new Date(streakAfterBackfill.lastReadDate).getUTCDate()).toBe(day2Date.getUTCDate());

    await request(app.server)
      .post("/sessions")
      .set("Authorization", `Bearer ${token}`)
      .send({ type: "FREE", durationMinutes: 5, pagesRead: 1, startedAt: day2, endedAt: day1 })
      .expect(400);
  });
});
