import { z } from "zod";
import { metaSchema } from "../books/book.schemas.js";
import { publicUserSchema, userSchema } from "../auth/auth.schemas.js";

export const userParamsSchema = z.object({ id: z.string().uuid() });

export const listFollowersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const followersResponseSchema = z.object({
  data: z.array(publicUserSchema),
  meta: metaSchema,
});
