import { z } from "zod";

export const readingStreakSchema = z.object({
  userId: z.string().uuid(),
  currentStreak: z.number().int().nonnegative(),
  longestStreak: z.number().int().nonnegative(),
  lastReadDate: z.date().nullable(),
  updatedAt: z.date(),
});
