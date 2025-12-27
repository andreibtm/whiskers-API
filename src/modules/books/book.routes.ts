import { BookStatus } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { errorSchema } from "../../lib/schemas.js";
import { parsePagination, buildMeta } from "../../lib/pagination.js";
import { prisma } from "../../lib/prisma.js";
import { incrementGoalForCompletion } from "../goals/goal.service.js";
import {
  bookSchema,
  createBookBodySchema,
  listBooksQuerySchema,
  listBooksResponseSchema,
  updateBookBodySchema,
} from "./book.schemas.js";

const sortableFields = ["createdAt", "title", "author", "status"] as const;

export default async function bookRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.get(
    "/",
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ["books"],
        querystring: listBooksQuerySchema,
        security: [{ bearerAuth: [] }],
        response: {
          200: listBooksResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { page = 1, limit = 10, status, sort = "createdAt", order = "desc" } = request.query;
      const { skip, take } = parsePagination(page, limit);

      const safeSort = sortableFields.includes(sort as (typeof sortableFields)[number]) ? sort : "createdAt";
      const where = { userId: request.user.id, ...(status ? { status } : {}) };
      const orderBy = { [safeSort]: order } as Record<string, "asc" | "desc">;

      const [total, books] = await prisma.$transaction([
        prisma.book.count({ where }),
        prisma.book.findMany({
          where,
          orderBy,
          skip,
          take,
          include: { progress: true },
        }),
      ]);

      return reply.status(200).send({ data: books, meta: buildMeta(page, limit, total) });
    }
  );

  server.post(
    "/",
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ["books"],
        body: createBookBodySchema,
        security: [{ bearerAuth: [] }],
        response: {
          201: bookSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user.id ?? request.user.sub;

      const owner = userId ? await prisma.user.findUnique({ where: { id: userId } }) : null;
      if (!owner) {
        return reply.status(404).send({ message: "User not found" });
      }

      const book = await prisma.book.create({
        data: {
          ...request.body,
          userId,
          finishedAt: null,
        },
      });

      return reply.status(201).send(book);
    }
  );

  server.get(
    "/:id",
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ["books"],
        params: bookSchema.pick({ id: true }),
        security: [{ bearerAuth: [] }],
        response: {
          200: bookSchema,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;

      const book = await prisma.book.findUnique({
        where: { id },
        include: { progress: true },
      });

      if (!book || book.userId !== request.user.id) {
        return reply.status(404).send({ message: "Book not found" });
      }

      return reply.status(200).send(book);
    }
  );

  server.put(
    "/:id",
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ["books"],
        params: bookSchema.pick({ id: true }),
        body: updateBookBodySchema,
        security: [{ bearerAuth: [] }],
        response: {
          200: bookSchema,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;

      const existing = await prisma.book.findUnique({ where: { id }, include: { progress: true } });
      if (!existing || existing.userId !== request.user.id) {
        return reply.status(404).send({ message: "Book not found" });
      }

      const nextStatus = request.body.status ?? existing.status;
      const finishedAtInput = request.body.finishedAt ? new Date(request.body.finishedAt) : null;
      if (finishedAtInput && Number.isNaN(finishedAtInput.getTime())) {
        return reply.status(400).send({ message: "finishedAt must be a valid datetime" });
      }

      const completedOnceAt = existing.progress?.finishedAt ?? existing.finishedAt;
      const alreadyCompletedOnce = Boolean(completedOnceAt);
      const finishingNow = nextStatus === BookStatus.FINISHED && existing.status !== BookStatus.FINISHED;
      const isFirstCompletion = finishingNow && !alreadyCompletedOnce;

      let finishedAt = existing.finishedAt;
      if (nextStatus === BookStatus.READING) {
        finishedAt = null;
      } else if (nextStatus === BookStatus.FINISHED) {
        finishedAt = finishedAtInput ?? existing.finishedAt ?? new Date();
      }

      const book = await prisma.book.update({
        where: { id },
        data: { ...request.body, status: nextStatus, finishedAt },
      });

      if (isFirstCompletion && existing.progress) {
        await prisma.progress.update({ where: { id: existing.progress.id }, data: { finishedAt: finishedAt as Date } });
      } else if (isFirstCompletion && !existing.progress) {
        await prisma.progress.create({
          data: {
            bookId: book.id,
            userId: request.user.id,
            currentPage: 0,
            percentage: 0,
            startedAt: null,
            finishedAt: finishedAt as Date,
          },
        });
      }

      if (isFirstCompletion && finishedAt) {
        // Use provided completion time when available to respect offline/late updates.
        await incrementGoalForCompletion(request.user.id, book.id, finishedAt);
      }

      return reply.status(200).send(book);
    }
  );

  server.delete(
    "/:id",
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ["books"],
        params: bookSchema.pick({ id: true }),
        security: [{ bearerAuth: [] }],
        response: {
          204: z.null(),
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;

      const existing = await prisma.book.findUnique({ where: { id } });
      if (!existing || existing.userId !== request.user.id) {
        return reply.status(404).send({ message: "Book not found" });
      }

      await prisma.book.delete({ where: { id } });
      return reply.status(204).send();
    }
  );
}
