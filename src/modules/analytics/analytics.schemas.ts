import { z } from "zod";

export const analyticsSummarySchema = z.object({
  totalPagesRead: z.number().int().nonnegative(),
  totalMinutesRead: z.number().int().nonnegative(),
  sessionCount: z.number().int().nonnegative(),
});

export const analyticsMonthlyQuerySchema = z.object({
  year: z.coerce.number().int().min(1970),
  month: z.coerce.number().int().min(1).max(12),
});

export const analyticsMonthlySchema = z.object({
  year: z.number().int(),
  month: z.number().int(),
  totalPagesRead: z.number().int().nonnegative(),
  totalMinutesRead: z.number().int().nonnegative(),
  sessionCount: z.number().int().nonnegative(),
  days: z.array(
    z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      pagesRead: z.number().int().nonnegative(),
      minutesRead: z.number().int().nonnegative(),
      sessionCount: z.number().int().nonnegative(),
    })
  ),
});
