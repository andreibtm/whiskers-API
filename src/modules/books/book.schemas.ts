import { BookStatus } from "@prisma/client";
import { z } from "zod";

export const metaSchema = z.object({
  page: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

export const progressSchema = z.object({
  id: z.string().uuid(),
  currentPage: z.number().int(),
  percentage: z.number(),
  startedAt: z.date().nullable(),
  finishedAt: z.date().nullable(),
  userId: z.string().uuid(),
  bookId: z.string().uuid(),
});

export const bookSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  author: z.string(),
  description: z.string().nullable(),
  coverUrl: z.string().url().nullable(),
  totalPages: z.number().int(),
  status: z.nativeEnum(BookStatus),
  finishedAt: z.date().nullable(),
  userId: z.string().uuid(),
  createdAt: z.date(),
  updatedAt: z.date(),
  progress: progressSchema.nullable().optional(),
});

export const createBookBodySchema = z.object({
  title: z.string().min(1),
  author: z.string().min(1),
  description: z.string().min(1).optional(),
  coverUrl: z.string().url().optional(),
  totalPages: z.number().int().positive(),
  status: z.nativeEnum(BookStatus).optional(),
});

export const updateBookBodySchema = createBookBodySchema.partial().extend({
  finishedAt: z.string().datetime().optional(),
});

export const listBooksQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  status: z.nativeEnum(BookStatus).optional(),
  sort: z.enum(["createdAt", "title", "author", "status"]).optional(),
  order: z.enum(["asc", "desc"]).optional(),
});

export const listBooksResponseSchema = z.object({
  data: z.array(bookSchema),
  meta: metaSchema,
});
