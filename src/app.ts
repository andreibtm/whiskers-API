import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import { Prisma } from "@prisma/client";
import Fastify, { type FastifyError, type FastifyReply, type FastifyRequest } from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import { ZodError } from "zod";
import { prisma } from "./lib/prisma.js";
import authPlugin from "./plugins/auth.js";
import rateLimitPlugin from "./plugins/rate-limit.js";
import swaggerPlugin from "./plugins/swagger.js";
import registerRoutes from "./routes.js";

export const buildApp = () => {
  const app = Fastify({
    logger: true,
  }).withTypeProvider<ZodTypeProvider>();

  const errorCodeForStatus = (status: number) => {
    if (status === 400) return "INVALID_REQUEST";
    if (status === 401) return "UNAUTHORIZED";
    if (status === 403) return "FORBIDDEN";
    if (status === 404) return "NOT_FOUND";
    if (status === 409) return "CONFLICT";
    if (status === 429) return "RATE_LIMITED";
    return "INTERNAL_ERROR";
  };

  app.addHook("preSerialization", (request, reply, payload: any, done) => {
    if (reply.statusCode < 400) return done(null, payload);

    const status = reply.statusCode;
    if (payload && typeof payload === "object" && "error" in payload) {
      return done(null, payload);
    }

    const message =
      payload && typeof payload === "object" && "message" in payload && typeof payload.message === "string"
        ? payload.message
        : typeof payload === "string"
        ? payload
        : "Unexpected error";

    return done(null, { error: { code: errorCodeForStatus(status), message } });
  });

  app.register(cors, { origin: true });
  app.register(sensible);
  app.register(rateLimitPlugin);
  app.register(authPlugin);
  app.register(swaggerPlugin);
  app.register(registerRoutes);

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.setErrorHandler((error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({ message: "Validation error" });
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        return reply.status(409).send({ message: "Resource already exists" });
      }
    }

    if (typeof error.statusCode === "number") {
      return reply.status(error.statusCode).send({ message: error.message });
    }

    request.log.error(error);
    return reply.status(500).send({ message: "Internal server error" });
  });

  app.addHook("onClose", async () => {
    await prisma.$disconnect();
  });

  return app;
};

export type AppInstance = ReturnType<typeof buildApp>;
