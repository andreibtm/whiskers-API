import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { env } from "../../config/env.js";
import { signAccessToken, signRefreshToken, toPublicUser, verifyPassword, hashPassword, type TokenPayload } from "../../lib/auth.js";
import { errorSchema } from "../../lib/schemas.js";
import { prisma } from "../../lib/prisma.js";
import {
  authResponseSchema,
  loginBodySchema,
  refreshBodySchema,
  registerBodySchema,
  userSchema,
} from "./auth.schemas.js";

export default async function authRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.post(
    "/register",
    {
      schema: {
        tags: ["auth"],
        body: registerBodySchema,
        response: {
          201: authResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { email, password } = request.body;

      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        return reply.status(409).send({ message: "Email already registered" });
      }

      const passwordHash = await hashPassword(password);
      const user = await prisma.user.create({
        data: {
          email,
          password: passwordHash,
        },
      });

      const payload: TokenPayload = { sub: user.id, id: user.id, role: user.role, email: user.email };
      const accessToken = signAccessToken(server, payload);
      const refreshToken = signRefreshToken(server, payload);

      return reply.status(201).send({ user: toPublicUser(user), accessToken, refreshToken });
    }
  );

  server.post(
    "/login",
    {
      schema: {
        tags: ["auth"],
        body: loginBodySchema,
        response: {
          200: authResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { email, password } = request.body;

      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) {
        return reply.status(401).send({ message: "Invalid credentials" });
      }

      const isValid = await verifyPassword(password, user.password);
      if (!isValid) {
        return reply.status(401).send({ message: "Invalid credentials" });
      }

      const payload: TokenPayload = { sub: user.id, id: user.id, role: user.role, email: user.email };
      const accessToken = signAccessToken(server, payload);
      const refreshToken = signRefreshToken(server, payload);

      return reply.status(200).send({ user: toPublicUser(user), accessToken, refreshToken });
    }
  );

  server.post(
    "/refresh",
    {
      schema: {
        tags: ["auth"],
        body: refreshBodySchema,
        response: {
          200: authResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { refreshToken } = request.body;

      let payload: TokenPayload;
      try {
        payload = server.jwt.verify<TokenPayload>(refreshToken, { secret: env.JWT_REFRESH_SECRET } as any);
      } catch {
        return reply.status(401).send({ message: "Invalid refresh token" });
      }

      const user = await prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user) {
        return reply.status(401).send({ message: "User no longer exists" });
      }

      const nextPayload: TokenPayload = { sub: user.id, id: user.id, role: user.role, email: user.email };
      const accessToken = signAccessToken(server, nextPayload);
      const nextRefreshToken = signRefreshToken(server, nextPayload);

      return reply.status(200).send({ user: toPublicUser(user), accessToken, refreshToken: nextRefreshToken });
    }
  );

  server.get(
    "/me",
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ["auth"],
        security: [{ bearerAuth: [] }],
        response: {
          200: z.object({ user: userSchema }),
        },
      },
    },
    async (request, reply) => {
      const user = await prisma.user.findUnique({ where: { id: request.user.id } });
      if (!user) {
        return reply.status(404).send({ message: "User not found" });
      }

      return reply.status(200).send({ user: toPublicUser(user) });
    }
  );
}
