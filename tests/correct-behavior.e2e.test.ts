import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

const resetDatabase = async () => {
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

const expectStandardError = (body: any) => {
  expect(body).toHaveProperty("error");
  expect(body.error).toEqual(expect.objectContaining({ code: expect.any(String), message: expect.any(String) }));
};

describe("correct behaviour specification", () => {
  const app = buildApp();

  beforeAll(async () => {
    await app.ready();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it("enforces authentication, authorization, and ignores client-supplied userId", async () => {
    const unauth = await request(app.server).get("/auth/me").expect(401);
    expectStandardError(unauth.body);

    const alice = await request(app.server)
      .post("/auth/register")
      .send({ email: "alice@example.com", password: "password123" })
      .expect(201);

    const aliceId = alice.body.user.id as string;
    const aliceToken = alice.body.accessToken as string;

    const aliceBook = await request(app.server)
      .post("/books")
      .set("Authorization", `Bearer ${aliceToken}`)
      .send({ title: "Alice Book", author: "Author", totalPages: 100 })
      .expect(201);

    const bob = await request(app.server)
      .post("/auth/register")
      .send({ email: "bob@example.com", password: "password123" })
      .expect(201);

    const bobId = bob.body.user.id as string;
    const bobToken = bob.body.accessToken as string;

    const forbiddenSession = await request(app.server)
      .post("/sessions")
      .set("Authorization", `Bearer ${bobToken}`)
      .send({
        bookId: aliceBook.body.id,
        userId: aliceId,
        type: "FREE",
        durationMinutes: 15,
        pagesRead: 5,
        startedAt: "2023-12-01T00:00:00.000Z",
      })
      .expect(404);

    expectStandardError(forbiddenSession.body);

    const bobBook = await request(app.server)
      .post("/books")
      .set("Authorization", `Bearer ${bobToken}`)
      .send({ title: "Bob Book", author: "Author", totalPages: 120 })
      .expect(201);

    const bobSession = await request(app.server)
      .post("/sessions")
      .set("Authorization", `Bearer ${bobToken}`)
      .send({
        bookId: bobBook.body.id,
        userId: aliceId,
        type: "POMODORO",
        durationMinutes: 10,
        pagesRead: 4,
        startedAt: "2023-12-02T00:00:00.000Z",
      })
      .expect(201);

    expect(bobSession.body.userId).toBe(bobId);
  });

  it("validates sessions, applies effective dates to streaks, and attributes analytics by effective month", async () => {
    const user = await request(app.server)
      .post("/auth/register")
      .send({ email: "sessions@example.com", password: "password123" })
      .expect(201);

    const token = user.body.accessToken as string;

    const book = await request(app.server)
      .post("/books")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Session Book", author: "Author", totalPages: 150 })
      .expect(201);

    const invalidEnd = await request(app.server)
      .post("/sessions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        bookId: book.body.id,
        type: "FREE",
        durationMinutes: 5,
        pagesRead: 2,
        startedAt: "2023-12-01T12:00:00.000Z",
        endedAt: "2023-12-01T11:00:00.000Z",
      })
      .expect(400);
    expectStandardError(invalidEnd.body);

    const futureSession = await request(app.server)
      .post("/sessions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        bookId: book.body.id,
        type: "FREE",
        durationMinutes: 5,
        pagesRead: 2,
        startedAt: "2100-01-01T00:00:00.000Z",
      })
      .expect(400);
    expectStandardError(futureSession.body);

    const decSession = await request(app.server)
      .post("/sessions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        bookId: book.body.id,
        type: "FREE",
        durationMinutes: 20,
        pagesRead: 10,
        startedAt: "2023-12-01T10:00:00.000Z",
        endedAt: "2023-12-01T10:20:00.000Z",
      })
      .expect(201);

    const streakAfterDec = await request(app.server)
      .get("/streak")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(streakAfterDec.body.currentStreak).toBe(1);
    expect(new Date(streakAfterDec.body.lastReadDate).toISOString()).toBe("2023-12-01T10:20:00.000Z");

    await request(app.server)
      .post("/sessions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        bookId: book.body.id,
        type: "FREE",
        durationMinutes: 10,
        pagesRead: 5,
        startedAt: "2023-11-30T10:00:00.000Z",
        endedAt: "2023-11-30T10:10:00.000Z",
      })
      .expect(201);

    const streakAfterBackfill = await request(app.server)
      .get("/streak")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(streakAfterBackfill.body.currentStreak).toBe(1);
    expect(new Date(streakAfterBackfill.body.lastReadDate).toISOString()).toBe("2023-12-01T10:20:00.000Z");
    expect(streakAfterBackfill.body.longestStreak).toBeGreaterThanOrEqual(1);

    const november = await request(app.server)
      .get("/analytics/monthly?year=2023&month=11")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(november.body.sessionCount).toBe(1);
    expect(november.body.totalPagesRead).toBe(5);
    const novDay = november.body.days.find((d: any) => d.date === "2023-11-30");
    expect(novDay).toBeTruthy();
    expect(novDay.minutesRead).toBeGreaterThanOrEqual(10);

    const december = await request(app.server)
      .get("/analytics/monthly?year=2023&month=12")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(december.body.sessionCount).toBe(1);
    expect(december.body.totalPagesRead).toBe(10);
    const decDay = december.body.days.find((d: any) => d.date === "2023-12-01");
    expect(decDay).toBeTruthy();
    expect(decDay.minutesRead).toBeGreaterThanOrEqual(20);

    await request(app.server)
      .post("/sessions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        bookId: book.body.id,
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

    expect(october.body.sessionCount).toBe(0);
    expect(october.body.totalPagesRead).toBe(0);

    const novemberAfterSpan = await request(app.server)
      .get("/analytics/monthly?year=2023&month=11")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(novemberAfterSpan.body.sessionCount).toBe(2);
    expect(novemberAfterSpan.body.totalPagesRead).toBe(65);
  });

  it("supports book lifecycle transitions and idempotent yearly goals", async () => {
    const user = await request(app.server)
      .post("/auth/register")
      .send({ email: "books@example.com", password: "password123" })
      .expect(201);

    const token = user.body.accessToken as string;

    const book = await request(app.server)
      .post("/books")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Lifecycle", author: "Author", totalPages: 300 })
      .expect(201);

    const reading = await request(app.server)
      .put(`/books/${book.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "READING" })
      .expect(200);
    expect(reading.body.status).toBe("READING");

    const year = 2023;
    await request(app.server)
      .post("/goals")
      .set("Authorization", `Bearer ${token}`)
      .send({ year, targetBooks: 1 })
      .expect(201);

    const finished = await request(app.server)
      .put(`/books/${book.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "FINISHED", finishedAt: "2023-12-05T00:00:00.000Z" })
      .expect(200);
    expect(finished.body.status).toBe("FINISHED");

    const goalAfterFinish = await request(app.server)
      .get(`/goals/${year}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(goalAfterFinish.body.completedBooks).toBe(1);

    const reopened = await request(app.server)
      .put(`/books/${book.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "READING" })
      .expect(200);
    expect(reopened.body.finishedAt).toBeNull();

    await request(app.server)
      .put(`/books/${book.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "FINISHED", finishedAt: "2023-12-06T00:00:00.000Z" })
      .expect(200);

    const goalAfterRefinish = await request(app.server)
      .get(`/goals/${year}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(goalAfterRefinish.body.completedBooks).toBe(1);
  });

  it("supports social posts, likes, feed ordering, and likedByMe with conflict handling", async () => {
    const alice = await request(app.server)
      .post("/auth/register")
      .send({ email: "social-alice@example.com", password: "password123" })
      .expect(201);
    const aliceToken = alice.body.accessToken as string;

    const bob = await request(app.server)
      .post("/auth/register")
      .send({ email: "social-bob@example.com", password: "password123" })
      .expect(201);
    const bobId = bob.body.user.id as string;
    const bobToken = bob.body.accessToken as string;

    const unauthFeed = await request(app.server).get("/feed").expect(401);
    expectStandardError(unauthFeed.body);

    await request(app.server)
      .post(`/users/${bobId}/follow`)
      .set("Authorization", `Bearer ${aliceToken}`)
      .expect(201);

    const firstPost = await request(app.server)
      .post("/posts")
      .set("Authorization", `Bearer ${bobToken}`)
      .send({ content: "Post one" })
      .expect(201);

    const secondPost = await request(app.server)
      .post("/posts")
      .set("Authorization", `Bearer ${bobToken}`)
      .send({ content: "Post two" })
      .expect(201);

    const feed = await request(app.server)
      .get("/feed?page=1&limit=10")
      .set("Authorization", `Bearer ${aliceToken}`)
      .expect(200);

    expect(feed.body.data.length).toBeGreaterThanOrEqual(2);
    expect(feed.body.data[0].id).toBe(secondPost.body.id);
    expect(feed.body.data[0]).toHaveProperty("likedByMe", false);

    const like = await request(app.server)
      .post(`/posts/${firstPost.body.id}/like`)
      .set("Authorization", `Bearer ${aliceToken}`)
      .expect(200);
    expect(like.body.likeCount).toBe(1);

    const duplicateLike = await request(app.server)
      .post(`/posts/${firstPost.body.id}/like`)
      .set("Authorization", `Bearer ${aliceToken}`)
      .expect(409);
    expectStandardError(duplicateLike.body);

    const feedAfterLike = await request(app.server)
      .get("/feed?page=1&limit=10")
      .set("Authorization", `Bearer ${aliceToken}`)
      .expect(200);

    const liked = feedAfterLike.body.data.find((p: any) => p.id === firstPost.body.id);
    const unliked = feedAfterLike.body.data.find((p: any) => p.id === secondPost.body.id);

    expect(liked?.likedByMe).toBe(true);
    expect(unliked?.likedByMe).toBe(false);
  });
});
