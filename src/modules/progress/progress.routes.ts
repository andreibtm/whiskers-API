import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { errorSchema } from "../../lib/schemas.js";
import { prisma } from "../../lib/prisma.js";
import { progressBodySchema, progressResponseSchema } from "./progress.schemas.js";

const paramsSchema = z.object({ id: z.string().uuid() });

const computePercentage = (currentPage: number, totalPages: number) => {
  const ratio = totalPages === 0 ? 0 : (currentPage / totalPages) * 100;
  return Math.min(100, Number(ratio.toFixed(2)));
};

export default async function progressRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.get(
    "/:id/progress",
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ["progress"],
        params: paramsSchema,
        security: [{ bearerAuth: [] }],
        response: {
          200: progressResponseSchema,
          404: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;

      const book = await prisma.book.findUnique({ where: { id } });
      if (!book || book.userId !== request.user.id) {
        return reply.status(404).send({ message: "Book not found" });
      }

      const progress = await prisma.progress.findUnique({ where: { bookId: id } });
      if (!progress) {
        return reply.status(404).send({ message: "Progress not found" });
      }

      return reply.status(200).send(progress);
    }
  );

  server.post(
    "/:id/progress",
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ["progress"],
        params: paramsSchema,
        body: progressBodySchema,
        security: [{ bearerAuth: [] }],
        response: {
          200: progressResponseSchema,
          400: errorSchema,
          404: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const { currentPage, startedAt, finishedAt } = request.body;

      const book = await prisma.book.findUnique({ where: { id } });
      if (!book || book.userId !== request.user.id) {
        return reply.status(404).send({ message: "Book not found" });
      }

      if (currentPage > book.totalPages) {
        return reply.status(400).send({ message: "currentPage cannot exceed totalPages" });
      }

      const percentage = computePercentage(currentPage, book.totalPages);

      const progress = await prisma.progress.upsert({
        where: { bookId: id },
        update: {
          currentPage,
          percentage,
          startedAt: startedAt ? new Date(startedAt) : undefined,
          finishedAt: finishedAt
            ? new Date(finishedAt)
            : currentPage === book.totalPages
            ? new Date()
            : null,
        },
        create: {
          currentPage,
          percentage,
          startedAt: startedAt ? new Date(startedAt) : new Date(),
          finishedAt: finishedAt
            ? new Date(finishedAt)
            : currentPage === book.totalPages
            ? new Date()
            : null,
          userId: request.user.id,
          bookId: id,
        },
      });

      return reply.status(200).send(progress);
    }
  );
}
