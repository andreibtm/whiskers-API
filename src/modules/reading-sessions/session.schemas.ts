import { SessionType } from "@prisma/client";
import { z } from "zod";
import { metaSchema } from "../books/book.schemas.js";

export const readingSessionSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  bookId: z.string().uuid().nullable(),
  type: z.nativeEnum(SessionType),
  durationMinutes: z.number().int().nonnegative(),
  pagesRead: z.number().int().nonnegative(),
  startedAt: z.date(),
  endedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const createSessionBodySchema = z.object({
  id: z.string().uuid().optional(),
  bookId: z.string().uuid().optional(),
  type: z.nativeEnum(SessionType),
  durationMinutes: z.number().int().positive(),
  pagesRead: z.number().int().min(0).default(0),
  startedAt: z.string().datetime().optional(),
  endedAt: z.string().datetime().nullable().optional(),
});

export const listSessionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const listSessionsResponseSchema = z.object({
  data: z.array(readingSessionSchema),
  meta: metaSchema,
});
