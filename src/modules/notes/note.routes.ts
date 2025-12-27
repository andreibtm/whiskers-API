import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { errorSchema } from "../../lib/schemas.js";
import { parsePagination, buildMeta } from "../../lib/pagination.js";
import { prisma } from "../../lib/prisma.js";
import {
  listNotesQuerySchema,
  listNotesResponseSchema,
  noteBodySchema,
  noteSchema,
} from "./note.schemas.js";

const bookParamsSchema = z.object({ id: z.string().uuid() });
const noteParamsSchema = z.object({ noteId: z.string().uuid() });

export default async function noteRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.get(
    "/books/:id/notes",
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ["notes"],
        params: bookParamsSchema,
        querystring: listNotesQuerySchema,
        security: [{ bearerAuth: [] }],
        response: {
          200: listNotesResponseSchema,
          404: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const { page = 1, limit = 10 } = request.query;
      const { skip, take } = parsePagination(page, limit);

      const book = await prisma.book.findUnique({ where: { id } });
      if (!book || book.userId !== request.user.id) {
        return reply.status(404).send({ message: "Book not found" });
      }

      const [total, notes] = await prisma.$transaction([
        prisma.note.count({ where: { bookId: id, userId: request.user.id } }),
        prisma.note.findMany({
          where: { bookId: id, userId: request.user.id },
          orderBy: { createdAt: "desc" },
          skip,
          take,
        }),
      ]);

      return reply.status(200).send({ data: notes, meta: buildMeta(page, limit, total) });
    }
  );

  server.post(
    "/books/:id/notes",
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ["notes"],
        params: bookParamsSchema,
        body: noteBodySchema,
        security: [{ bearerAuth: [] }],
        response: {
          201: noteSchema,
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

      const note = await prisma.note.create({
        data: {
          content: request.body.content,
          bookId: id,
          userId: request.user.id,
        },
      });

      return reply.status(201).send(note);
    }
  );

  server.put(
    "/notes/:noteId",
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ["notes"],
        params: noteParamsSchema,
        body: noteBodySchema,
        response: {
          200: noteSchema,
          404: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const { noteId } = request.params;

      const note = await prisma.note.findUnique({ where: { id: noteId } });
      if (!note || note.userId !== request.user.id) {
        return reply.status(404).send({ message: "Note not found" });
      }

      const updated = await prisma.note.update({
        where: { id: noteId },
        data: { content: request.body.content },
      });

      return reply.status(200).send(updated);
    }
  );

  server.delete(
    "/notes/:noteId",
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ["notes"],
        params: noteParamsSchema,
        security: [{ bearerAuth: [] }],
        response: {
          204: z.null(),
          404: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const { noteId } = request.params;

      const note = await prisma.note.findUnique({ where: { id: noteId } });
      if (!note || note.userId !== request.user.id) {
        return reply.status(404).send({ message: "Note not found" });
      }

      await prisma.note.delete({ where: { id: noteId } });
      return reply.status(204).send();
    }
  );
}
