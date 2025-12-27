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

describe("reading and social flows", () => {
  const app = buildApp();

  beforeAll(async () => {
    await app.ready();
    await clearDatabase();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it("tracks reading activity and powers the social feed", async () => {
    const emailA = `alice+${Date.now()}@example.com`;
    const emailB = `bob+${Date.now()}@example.com`;
    const password = "password123";

    const userA = await request(app.server)
      .post("/auth/register")
      .send({ email: emailA, password })
      .expect(201);

    const tokenA = userA.body.accessToken as string;
    const userAId = userA.body.user.id as string;

    await request(app.server)
      .get("/auth/me")
      .set("Authorization", `Bearer ${tokenA}`)
      .expect(200);

    const decodedA = app.jwt.decode(tokenA) as any;
    expect(decodedA?.id).toBe(userAId);

    const userB = await request(app.server)
      .post("/auth/register")
      .send({ email: emailB, password })
      .expect(201);

    const tokenB = userB.body.accessToken as string;
    const userBId = userB.body.user.id as string;

    const usersBeforeBook = await prisma.user.findMany();
    expect(usersBeforeBook.some((u) => u.id === userAId)).toBe(true);

    const book = await request(app.server)
      .post("/books")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ title: "Book A", author: "Author", totalPages: 120 })
      .expect(201);

    const bookId = book.body.id as string;

    const year = new Date().getUTCFullYear();
    await request(app.server)
      .post("/goals")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ year, targetBooks: 3 })
      .expect(201);

    const session = await request(app.server)
      .post("/sessions")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        bookId,
        type: "POMODORO",
        durationMinutes: 25,
        pagesRead: 15,
        startedAt: new Date().toISOString(),
      })
      .expect(201);

    expect(session.body.userId).toBe(userAId);

    const sessionsForUser = await prisma.readingSession.findMany({ where: { userId: userAId } });
    expect(sessionsForUser.length).toBeGreaterThanOrEqual(1);

    const streak = await request(app.server)
      .get("/streak")
      .set("Authorization", `Bearer ${tokenA}`)
      .expect(200);

    expect(streak.body.currentStreak).toBeGreaterThanOrEqual(1);

    const summary = await request(app.server)
      .get("/analytics/summary")
      .set("Authorization", `Bearer ${tokenA}`)
      .expect(200);

    expect(summary.body.sessionCount).toBeGreaterThanOrEqual(1);
    expect(summary.body.totalPagesRead).toBeGreaterThanOrEqual(15);

    await request(app.server)
      .put(`/books/${bookId}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ status: "FINISHED" })
      .expect(200);

    const goal = await request(app.server)
      .get(`/goals/${year}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .expect(200);

    expect(goal.body.completedBooks).toBe(1);

    await request(app.server)
      .post(`/users/${userBId}/follow`)
      .set("Authorization", `Bearer ${tokenA}`)
      .expect(201);

    const post = await request(app.server)
      .post("/posts")
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ content: "Great session today" })
      .expect(201);

    const postId = post.body.id as string;

    const initialFeed = await request(app.server)
      .get("/feed")
      .set("Authorization", `Bearer ${tokenA}`)
      .expect(200);

    const feedPost = initialFeed.body.data.find((item: { id: string }) => item.id === postId);
    expect(feedPost).toBeTruthy();

    const like = await request(app.server)
      .post(`/posts/${postId}/like`)
      .set("Authorization", `Bearer ${tokenA}`)
      .expect(200);

    expect(like.body.likeCount).toBe(1);

    const comment = await request(app.server)
      .post(`/posts/${postId}/comments`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ content: "Nice work!" })
      .expect(201);

    const commentId = comment.body.id as string;

    const comments = await request(app.server)
      .get(`/posts/${postId}/comments`)
      .set("Authorization", `Bearer ${tokenA}`)
      .expect(200);

    expect(comments.body.data.some((c: { id: string }) => c.id === commentId)).toBe(true);

    const feedAfterSocial = await request(app.server)
      .get("/feed")
      .set("Authorization", `Bearer ${tokenA}`)
      .expect(200);

    const updatedPost = feedAfterSocial.body.data.find((item: { id: string }) => item.id === postId);
    expect(updatedPost.likeCount).toBe(1);
    expect(updatedPost.commentCount).toBe(1);
  });
});
