import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { hashPassword } from "../src/lib/auth.js";
import { prisma } from "../src/lib/prisma.js";
import { resetDatabase } from "./utils/reset-db.js";

describe("security and admin boundaries", () => {
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

  it("GET /posts omits user emails", async () => {
    const password = "password123";
    const authorEmail = `author+${Date.now()}@example.com`;
    const readerEmail = `reader+${Date.now()}@example.com`;

    const author = await request(app.server)
      .post("/auth/register")
      .send({ email: authorEmail, password })
      .expect(201);

    const authorToken = author.body.accessToken as string;

    await request(app.server)
      .post("/posts")
      .set("Authorization", `Bearer ${authorToken}`)
      .send({ content: "Privacy check post" })
      .expect(201);

    const reader = await request(app.server)
      .post("/auth/register")
      .send({ email: readerEmail, password })
      .expect(201);

    const readerToken = reader.body.accessToken as string;

    const posts = await request(app.server)
      .get("/posts")
      .set("Authorization", `Bearer ${readerToken}`)
      .expect(200);

    expect(posts.body.data.length).toBeGreaterThanOrEqual(1);
    posts.body.data.forEach((post: any) => {
      expect(post.user).toBeDefined();
      expect(post.user).not.toHaveProperty("email");
      expect(post.user).not.toHaveProperty("role");
    });
  });

  it("admin endpoint rejects standard users and allows seeded admins", async () => {
    const password = "password123";
    const userEmail = `user+${Date.now()}@example.com`;

    const user = await request(app.server)
      .post("/auth/register")
      .send({ email: userEmail, password })
      .expect(201);

    const userToken = user.body.accessToken as string;

    await request(app.server)
      .get("/users/admin/users")
      .set("Authorization", `Bearer ${userToken}`)
      .expect(403);

    const adminEmail = `admin+${Date.now()}@example.com`;
    const adminPassword = "adminpassword";
    const adminHash = await hashPassword(adminPassword);

    await prisma.user.create({
      data: {
        email: adminEmail,
        password: adminHash,
        role: "ADMIN",
      },
    });

    const adminLogin = await request(app.server)
      .post("/auth/login")
      .send({ email: adminEmail, password: adminPassword })
      .expect(200);

    const adminToken = adminLogin.body.accessToken as string;

    const adminRes = await request(app.server)
      .get("/users/admin/users")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);

    expect(Array.isArray(adminRes.body.data)).toBe(true);
    expect(adminRes.body.meta).toBeDefined();
  });

  it("reopening a book clears finishedAt", async () => {
    const password = "password123";
    const email = `reader+${Date.now()}@example.com`;

    const register = await request(app.server)
      .post("/auth/register")
      .send({ email, password })
      .expect(201);

    const token = register.body.accessToken as string;

    const book = await request(app.server)
      .post("/books")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Finite Book", author: "Author", totalPages: 200 })
      .expect(201);

    const bookId = book.body.id as string;
    const finishedAt = new Date().toISOString();

    const finished = await request(app.server)
      .put(`/books/${bookId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "FINISHED", finishedAt })
      .expect(200);

    expect(finished.body.finishedAt).toBeTruthy();

    const reopened = await request(app.server)
      .put(`/books/${bookId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "READING" })
      .expect(200);

    expect(reopened.body.finishedAt).toBeNull();

    const stored = await prisma.book.findUnique({ where: { id: bookId } });
    expect(stored?.finishedAt).toBeNull();
  });
});
