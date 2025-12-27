import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

let accessToken: string;
let refreshToken: string;

describe("auth flow", () => {
  const app = buildApp();

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it("registers and accesses a protected route", async () => {
    const email = `user+${Date.now()}@example.com`;
    const password = "password123";

    const registerRes = await request(app.server)
      .post("/auth/register")
      .send({ email, password })
      .expect(201);

    expect(registerRes.body.user.email).toBe(email);

    accessToken = registerRes.body.accessToken;
    refreshToken = registerRes.body.refreshToken;

    const meRes = await request(app.server)
      .get("/auth/me")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);

    expect(meRes.body.user.email).toBe(email);
  });

  it("rejects protected route without token", async () => {
    await request(app.server).get("/auth/me").expect(401);
  });

  it("refreshes tokens with a valid refresh token", async () => {
    const res = await request(app.server)
      .post("/auth/refresh")
      .send({ refreshToken })
      .expect(200);

    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();
  });
});
