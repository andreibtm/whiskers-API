import { z } from "zod";
import { metaSchema } from "../books/book.schemas.js";
import { postWithUserSchema } from "../posts/post.schemas.js";

export const feedQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const feedResponseSchema = z.object({
  data: z.array(postWithUserSchema),
  meta: metaSchema,
});
