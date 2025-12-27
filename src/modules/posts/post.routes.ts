import { Prisma, type User } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { toPublicUserProfile } from "../../lib/auth.js";
import { buildMeta, parsePagination } from "../../lib/pagination.js";
import { prisma } from "../../lib/prisma.js";
import { errorSchema } from "../../lib/schemas.js";
import {
  commentBodySchema,
  commentWithUserSchema,
  commentsResponseSchema,
  createPostBodySchema,
  likeResponseSchema,
  listCommentsQuerySchema,
  listPostsQuerySchema,
  listPostsResponseSchema,
  postWithUserSchema,
} from "./post.schemas.js";

const postParamsSchema = z.object({ id: z.string().uuid() });
const commentParamsSchema = z.object({ commentId: z.string().uuid() });

const mapPost = (
  post: {
    id: string;
    userId: string;
    bookId: string | null;
    content: string;
    createdAt: Date;
    updatedAt: Date;
    user: User;
    _count: { likes: number; comments: number };
    likes?: { userId: string }[];
  },
  currentUserId: string
) => ({
  id: post.id,
  userId: post.userId,
  bookId: post.bookId,
  content: post.content,
  createdAt: post.createdAt,
  updatedAt: post.updatedAt,
  likeCount: post._count.likes,
  commentCount: post._count.comments,
  likedByMe: Boolean(post.likes?.some((like) => like.userId === currentUserId)),
  user: toPublicUserProfile(post.user),
});

export default async function postRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.post(
    "/",
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ["posts"],
        body: createPostBodySchema,
        security: [{ bearerAuth: [] }],
        response: {
          201: postWithUserSchema,
        },
      },
    },
    async (request, reply) => {
      const { content, bookId } = request.body;

      if (bookId) {
        const book = await prisma.book.findUnique({ where: { id: bookId } });
        if (!book || book.userId !== request.user.id) {
          return reply.status(404).send({ message: "Book not found" });
        }
      }

      const post = await prisma.post.create({
        data: {
          content,
          bookId: bookId ?? null,
          userId: request.user.id,
        },
        include: { user: true, _count: { select: { likes: true, comments: true } } },
      });

      return reply.status(201).send(mapPost(post, request.user.id));
    }
  );

  server.get(
    "/",
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ["posts"],
        querystring: listPostsQuerySchema,
        security: [{ bearerAuth: [] }],
        response: {
          200: listPostsResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { page = 1, limit = 10, userId } = request.query;
      const { skip, take } = parsePagination(page, limit);

      if (userId) {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
          return reply.status(404).send({ message: "User not found" });
        }
      }

      const where = userId ? { userId } : {};

      const [total, posts] = await prisma.$transaction([
        prisma.post.count({ where }),
        prisma.post.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip,
          take,
          include: {
            user: true,
            _count: { select: { likes: true, comments: true } },
            likes: { where: { userId: request.user.id }, select: { userId: true } },
          },
        }),
      ]);

      const data = posts.map((post) => mapPost(post, request.user.id));
      return reply.status(200).send({ data, meta: buildMeta(page, limit, total) });
    }
  );

  server.get(
    "/:id",
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ["posts"],
        params: postParamsSchema,
        security: [{ bearerAuth: [] }],
        response: {
          200: postWithUserSchema,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;

      const post = await prisma.post.findUnique({
        where: { id },
        include: {
          user: true,
          _count: { select: { likes: true, comments: true } },
          likes: { where: { userId: request.user.id }, select: { userId: true } },
        },
      });

      if (!post) {
        return reply.status(404).send({ message: "Post not found" });
      }

      return reply.status(200).send(mapPost(post, request.user.id));
    }
  );

  server.delete(
    "/:id",
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ["posts"],
        params: postParamsSchema,
        security: [{ bearerAuth: [] }],
        response: {
          204: z.null(),
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;

      const post = await prisma.post.findUnique({ where: { id } });
      if (!post || post.userId !== request.user.id) {
        return reply.status(404).send({ message: "Post not found" });
      }

      await prisma.post.delete({ where: { id } });
      return reply.status(204).send();
    }
  );

  server.post(
    "/:id/like",
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ["posts"],
        params: postParamsSchema,
        security: [{ bearerAuth: [] }],
        response: {
          200: likeResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const post = await prisma.post.findUnique({ where: { id } });
      if (!post) {
        return reply.status(404).send({ message: "Post not found" });
      }

      try {
        await prisma.like.create({
          data: { postId: id, userId: request.user.id },
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          return reply.status(409).send({ message: "Already liked" });
        }
        throw error;
      }

      const likeCount = await prisma.like.count({ where: { postId: id } });
      return reply.status(200).send({ likeCount });
    }
  );

  server.delete(
    "/:id/like",
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ["posts"],
        params: postParamsSchema,
        security: [{ bearerAuth: [] }],
        response: {
          200: likeResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const post = await prisma.post.findUnique({ where: { id } });
      if (!post) {
        return reply.status(404).send({ message: "Post not found" });
      }

      const like = await prisma.like.findUnique({
        where: { userId_postId: { userId: request.user.id, postId: id } },
      });

      if (!like) {
        return reply.status(404).send({ message: "Like not found" });
      }

      await prisma.like.delete({ where: { userId_postId: { userId: request.user.id, postId: id } } });
      const likeCount = await prisma.like.count({ where: { postId: id } });
      return reply.status(200).send({ likeCount });
    }
  );

  server.post(
    "/:id/comments",
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ["posts"],
        params: postParamsSchema,
        body: commentBodySchema,
        security: [{ bearerAuth: [] }],
        response: {
          201: commentWithUserSchema,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const post = await prisma.post.findUnique({ where: { id } });
      if (!post) {
        return reply.status(404).send({ message: "Post not found" });
      }

      const comment = await prisma.comment.create({
        data: {
          content: request.body.content,
          postId: id,
          userId: request.user.id,
        },
        include: { user: true },
      });

      return reply.status(201).send({ ...comment, user: toPublicUserProfile(comment.user) });
    }
  );

  server.get(
    "/:id/comments",
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ["posts"],
        params: postParamsSchema,
        querystring: listCommentsQuerySchema,
        security: [{ bearerAuth: [] }],
        response: {
          200: commentsResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const { page = 1, limit = 10 } = request.query;
      const { skip, take } = parsePagination(page, limit);

      const post = await prisma.post.findUnique({ where: { id } });
      if (!post) {
        return reply.status(404).send({ message: "Post not found" });
      }

      const [total, comments] = await prisma.$transaction([
        prisma.comment.count({ where: { postId: id } }),
        prisma.comment.findMany({
          where: { postId: id },
          orderBy: { createdAt: "desc" },
          skip,
          take,
          include: { user: true },
        }),
      ]);

      const data = comments.map((comment) => ({ ...comment, user: toPublicUserProfile(comment.user) }));
      return reply.status(200).send({ data, meta: buildMeta(page, limit, total) });
    }
  );

  server.delete(
    "/comments/:commentId",
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ["posts"],
        params: commentParamsSchema,
        security: [{ bearerAuth: [] }],
        response: {
          204: z.null(),
        },
      },
    },
    async (request, reply) => {
      const { commentId } = request.params;

      const comment = await prisma.comment.findUnique({ where: { id: commentId } });
      if (!comment || comment.userId !== request.user.id) {
        return reply.status(404).send({ message: "Comment not found" });
      }

      await prisma.comment.delete({ where: { id: commentId } });
      return reply.status(204).send();
    }
  );
}
