import fastifyJwt from "@fastify/jwt";
import fp from "fastify-plugin";
import { env } from "../config/env.js";
import type { FastifyReply, FastifyRequest } from "fastify";

async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
  } catch {
    return reply.status(401).send({ message: "Unauthorized" });
  }
}

async function authorizeAdmin(request: FastifyRequest, reply: FastifyReply) {
  await authenticate(request, reply);
  if (reply.sent) return;

  if (request.user.role !== "ADMIN") {
    return reply.status(403).send({ message: "Forbidden" });
  }
}

export default fp(async (app) => {
  app.register(fastifyJwt, {
    secret: env.JWT_SECRET,
    sign: {
      expiresIn: env.ACCESS_TOKEN_EXPIRES_IN,
    },
  });

  app.decorate("authenticate", authenticate);
  app.decorate("authorizeAdmin", authorizeAdmin);
});
