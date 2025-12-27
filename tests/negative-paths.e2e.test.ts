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

describe("negative paths", () => {
  const app = buildApp();

  beforeAll(async () => {
    await app.ready();
    await clearDatabase();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it("rejects creating a session for a book not owned", async () => {
    const owner = await request(app.server).post("/auth/register").send({ email: "owner@example.com", password: "password123" });
    const other = await request(app.server).post("/auth/register").send({ email: "other@example.com", password: "password123" });

    const ownerBook = await request(app.server)
      .post("/books")
      .set("Authorization", `Bearer ${owner.body.accessToken}`)
      .send({ title: "Owner Book", author: "Auth", totalPages: 100 });

    await request(app.server)
      .post("/sessions")
      .set("Authorization", `Bearer ${other.body.accessToken}`)
      .send({
        bookId: ownerBook.body.id,
        type: "POMODORO",
        durationMinutes: 10,
        pagesRead: 5,
      })
      .expect(404);
  });

  it("rejects creating a session with an invalid type", async () => {
    const user = await request(app.server).post("/auth/register").send({ email: "session-type@example.com", password: "password123" });

    await request(app.server)
      .post("/sessions")
      .set("Authorization", `Bearer ${user.body.accessToken}`)
      .send({ type: "INVALID", durationMinutes: 10, pagesRead: 1 })
      .expect(400);
  });

  it("returns a zeroed streak and analytics when no sessions exist", async () => {
    const user = await request(app.server).post("/auth/register").send({ email: "nostreak@example.com", password: "password123" });

    const streak = await request(app.server)
      .get("/streak")
      .set("Authorization", `Bearer ${user.body.accessToken}`)
      .expect(200);

    expect(streak.body.currentStreak).toBe(0);
    expect(streak.body.longestStreak).toBe(0);

    const summary = await request(app.server)
      .get("/analytics/summary")
      .set("Authorization", `Bearer ${user.body.accessToken}`)
      .expect(200);

    expect(summary.body.sessionCount).toBe(0);
    expect(summary.body.totalPagesRead).toBe(0);
  });

  it("rejects duplicate yearly goals", async () => {
    const user = await request(app.server).post("/auth/register").send({ email: "goals@example.com", password: "password123" });
    const token = user.body.accessToken as string;
    const year = new Date().getUTCFullYear();

    await request(app.server)
      .post("/goals")
      .set("Authorization", `Bearer ${token}`)
      .send({ year, targetBooks: 5 })
      .expect(201);

    await request(app.server)
      .post("/goals")
      .set("Authorization", `Bearer ${token}`)
      .send({ year, targetBooks: 10 })
      .expect(409);
  });

  it("handles social failures (404/409) and feed auth/pagination", async () => {
    const user = await request(app.server).post("/auth/register").send({ email: "social@example.com", password: "password123" });
    const token = user.body.accessToken as string;

    const fakePostId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

    await request(app.server).post(`/posts/${fakePostId}/like`).set("Authorization", `Bearer ${token}`).expect(404);

    const post = await request(app.server)
      .post("/posts")
      .set("Authorization", `Bearer ${token}`)
      .send({ content: "first" })
      .expect(201);

    await request(app.server).post(`/posts/${post.body.id}/like`).set("Authorization", `Bearer ${token}`).expect(200);
    await request(app.server).post(`/posts/${post.body.id}/like`).set("Authorization", `Bearer ${token}`).expect(409);

    await request(app.server)
      .post(`/posts/${post.body.id}/comments`)
      .set("Authorization", `Bearer ${token}`)
      .send({ content: "hi" })
      .expect(201);

    await request(app.server)
      .post(`/posts/${fakePostId}/comments`)
      .set("Authorization", `Bearer ${token}`)
      .send({ content: "nope" })
      .expect(404);

    // Feed requires auth
    await request(app.server).get("/feed").expect(401);

    // Feed ordering (newest first)
    const post2 = await request(app.server)
      .post("/posts")
      .set("Authorization", `Bearer ${token}`)
      .send({ content: "second" })
      .expect(201);

    const feed = await request(app.server)
      .get("/feed?page=1&limit=10")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(feed.body.data[0].id).toBe(post2.body.id);
  });
});
