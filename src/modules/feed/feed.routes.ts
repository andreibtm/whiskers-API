import type { User } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { toPublicUserProfile } from "../../lib/auth.js";
import { buildMeta, parsePagination } from "../../lib/pagination.js";
import { prisma } from "../../lib/prisma.js";
import { errorSchema } from "../../lib/schemas.js";
import { feedQuerySchema, feedResponseSchema } from "./feed.schemas.js";

const mapPost = (post: {
  id: string;
  userId: string;
  bookId: string | null;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  user: User;
  _count: { likes: number; comments: number };
  likes?: { userId: string }[];
}, currentUserId: string) => ({
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

export default async function feedRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.get(
    "/",
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ["feed"],
        querystring: feedQuerySchema,
        security: [{ bearerAuth: [] }],
        response: {
          200: feedResponseSchema,
        },
      },
    },
    async (request, reply) => {
      if (!request.user?.id) {
        return reply.status(401).send({ message: "Unauthorized" });
      }

      const { page = 1, limit = 10 } = request.query;
      const { skip, take } = parsePagination(page, limit);

      const following = await prisma.userFollow.findMany({
        where: { followerId: request.user.id },
        select: { followedId: true },
      });

      const authorIds = Array.from(new Set([request.user.id, ...following.map((f) => f.followedId)]));

      const [total, posts] = await prisma.$transaction([
        prisma.post.count({ where: { userId: { in: authorIds } } }),
        prisma.post.findMany({
          where: { userId: { in: authorIds } },
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
}
