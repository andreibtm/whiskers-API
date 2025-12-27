import { z } from "zod";
import { progressSchema } from "../books/book.schemas.js";

export const progressBodySchema = z.object({
  currentPage: z.number().int().min(0),
  startedAt: z.string().datetime().optional(),
  finishedAt: z.string().datetime().optional(),
});

export const progressResponseSchema = progressSchema;
