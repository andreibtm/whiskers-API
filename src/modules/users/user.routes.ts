import { Prisma } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { toPublicUser, toPublicUserProfile } from "../../lib/auth.js";
import { errorSchema } from "../../lib/schemas.js";
import { parsePagination, buildMeta } from "../../lib/pagination.js";
import { metaSchema } from "../books/book.schemas.js";
import { prisma } from "../../lib/prisma.js";
import { publicUserSchema, userSchema } from "../auth/auth.schemas.js";
import {
  followersResponseSchema,
  listFollowersQuerySchema,
  userParamsSchema,
} from "./user.schemas.js";

export default async function userRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.post(
    "/:id/follow",
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ["users"],
        params: userParamsSchema,
        security: [{ bearerAuth: [] }],
        response: {
          201: z.object({ user: publicUserSchema }),
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;

      if (id === request.user.id) {
        return reply.status(400).send({ message: "Cannot follow yourself" });
      }

      const target = await prisma.user.findUnique({ where: { id } });
      if (!target) {
        return reply.status(404).send({ message: "User not found" });
      }

      try {
        await prisma.userFollow.create({
          data: { followerId: request.user.id, followedId: id },
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          return reply.status(409).send({ message: "Already following" });
        }
        throw error;
      }

      return reply.status(201).send({ user: toPublicUserProfile(target) });
    }
  );

  // Minimal admin-only endpoint to surface the role; returns paginated users.
  server.get(
    "/admin/users",
    {
      preHandler: [app.authorizeAdmin],
      schema: {
        tags: ["users"],
        querystring: listFollowersQuerySchema,
        security: [{ bearerAuth: [] }],
        response: {
          200: z.object({ data: z.array(userSchema), meta: metaSchema }),
        },
      },
    },
    async (request, reply) => {
      const { page = 1, limit = 10 } = request.query;
      const { skip, take } = parsePagination(page, limit);

      const [total, users] = await prisma.$transaction([
        prisma.user.count(),
        prisma.user.findMany({ orderBy: { createdAt: "desc" }, skip, take }),
      ]);

      return reply.status(200).send({ data: users.map(toPublicUser), meta: buildMeta(page, limit, total) });
    }
  );

  server.delete(
    "/:id/unfollow",
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ["users"],
        params: userParamsSchema,
        security: [{ bearerAuth: [] }],
        response: {
          204: z.null(),
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;

      const follow = await prisma.userFollow.findUnique({
        where: { followerId_followedId: { followerId: request.user.id, followedId: id } },
      });

      if (!follow) {
        return reply.status(404).send({ message: "Follow relationship not found" });
      }

      await prisma.userFollow.delete({ where: { followerId_followedId: { followerId: request.user.id, followedId: id } } });
      return reply.status(204).send();
    }
  );

  server.get(
    "/:id/followers",
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ["users"],
        params: userParamsSchema,
        querystring: listFollowersQuerySchema,
        security: [{ bearerAuth: [] }],
        response: {
          200: followersResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const { page = 1, limit = 10 } = request.query;
      const { skip, take } = parsePagination(page, limit);

      const target = await prisma.user.findUnique({ where: { id } });
      if (!target) {
        return reply.status(404).send({ message: "User not found" });
      }

      const [total, rows] = await prisma.$transaction([
        prisma.userFollow.count({ where: { followedId: id } }),
        prisma.userFollow.findMany({
          where: { followedId: id },
          include: { follower: true },
          orderBy: { createdAt: "desc" },
          skip,
          take,
        }),
      ]);

      const data = rows.map(({ follower }) => toPublicUserProfile(follower));

      return reply.status(200).send({ data, meta: buildMeta(page, limit, total) });
    }
  );
}
