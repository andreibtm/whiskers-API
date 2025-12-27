import { z } from "zod";

export const readingGoalSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  year: z.number().int(),
  targetBooks: z.number().int().nonnegative(),
  completedBooks: z.number().int().nonnegative(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const createGoalBodySchema = z.object({
  year: z.coerce.number().int().min(1970),
  targetBooks: z.coerce.number().int().min(0),
});

export const goalParamsSchema = z.object({
  year: z.coerce.number().int().min(1970),
});
