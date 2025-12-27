import { z } from "zod";
import { metaSchema } from "../books/book.schemas.js";

export const noteSchema = z.object({
  id: z.string().uuid(),
  content: z.string(),
  userId: z.string().uuid(),
  bookId: z.string().uuid(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const noteBodySchema = z.object({
  content: z.string().min(1),
});

export const listNotesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const listNotesResponseSchema = z.object({
  data: z.array(noteSchema),
  meta: metaSchema,
});
