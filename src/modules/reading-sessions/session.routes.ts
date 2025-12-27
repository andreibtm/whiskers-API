import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { parsePagination, buildMeta } from "../../lib/pagination.js";
import { prisma } from "../../lib/prisma.js";
import { errorSchema } from "../../lib/schemas.js";
import {
  createSessionBodySchema,
  listSessionsQuerySchema,
  listSessionsResponseSchema,
  readingSessionSchema,
} from "./session.schemas.js";
import { updateStreakFromSession, validateStreakDate } from "./streak.service.js";

export default async function sessionRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.post(
    "/",
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ["sessions"],
        body: createSessionBodySchema,
        security: [{ bearerAuth: [] }],
        response: {
          201: readingSessionSchema,
        },
      },
    },
    async (request, reply) => {
      const { id: _ignoredId, bookId, startedAt, endedAt, ...rest } = request.body;

      if (bookId) {
        const book = await prisma.book.findUnique({ where: { id: bookId } });
        if (!book || book.userId !== request.user.id) {
          return reply.status(404).send({ message: "Book not found" });
        }
      }

      const data = {
        userId: request.user.id,
        bookId: bookId ?? null,
        startedAt: startedAt ? new Date(startedAt) : new Date(),
        endedAt: endedAt ? new Date(endedAt) : null,
        ...rest,
      };

      if (data.endedAt && data.endedAt < data.startedAt) {
        return reply.status(400).send({ message: "endedAt cannot be before startedAt" });
      }

      const validationNow = new Date();
      const startError = validateStreakDate(data.startedAt, validationNow);
      if (startError) {
        return reply.status(400).send({ message: startError });
      }
      const endError = validateStreakDate(data.endedAt ?? data.startedAt, validationNow);
      if (endError) {
        return reply.status(400).send({ message: endError });
      }

      const session = await prisma.$transaction(async (tx) => {
        const created = await tx.readingSession.create({ data });
        await updateStreakFromSession(
          request.user.id,
          created.startedAt,
          created.endedAt ?? created.startedAt,
          tx,
          validationNow
        );
        return created;
      });

      return reply.status(201).send(session);
    }
  );

  server.get(
    "/",
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ["sessions"],
        querystring: listSessionsQuerySchema,
        security: [{ bearerAuth: [] }],
        response: {
          200: listSessionsResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { page = 1, limit = 10 } = request.query;
      const { skip, take } = parsePagination(page, limit);

      const [total, sessions] = await prisma.$transaction([
        prisma.readingSession.count({ where: { userId: request.user.id } }),
        prisma.readingSession.findMany({
          where: { userId: request.user.id },
          orderBy: { startedAt: "desc" },
          skip,
          take,
        }),
      ]);

      return reply.status(200).send({ data: sessions, meta: buildMeta(page, limit, total) });
    }
  );
}
