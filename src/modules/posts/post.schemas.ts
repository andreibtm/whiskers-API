import { z } from "zod";
import { metaSchema } from "../books/book.schemas.js";
import { publicUserSchema } from "../auth/auth.schemas.js";

export const createPostBodySchema = z.object({
  content: z.string().min(1).max(1000),
  bookId: z.string().uuid().optional(),
});

export const postSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  bookId: z.string().uuid().nullable(),
  content: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const postWithUserSchema = postSchema.extend({
  user: publicUserSchema,
  likeCount: z.number().int().nonnegative(),
  commentCount: z.number().int().nonnegative(),
  likedByMe: z.boolean(),
});

export const listPostsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  userId: z.string().uuid().optional(),
});

export const listCommentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const listPostsResponseSchema = z.object({
  data: z.array(postWithUserSchema),
  meta: metaSchema,
});

export const commentSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  postId: z.string().uuid(),
  content: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const commentBodySchema = z.object({
  content: z.string().min(1).max(1000),
});

export const commentWithUserSchema = commentSchema.extend({
  user: publicUserSchema,
});

export const commentsResponseSchema = z.object({
  data: z.array(commentWithUserSchema),
  meta: metaSchema,
});

export const likeResponseSchema = z.object({
  likeCount: z.number().int().nonnegative(),
});
