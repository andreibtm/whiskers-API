import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { readingStreakSchema } from "./streak.schemas.js";
import { getStreakForUser } from "./streak.service.js";

export default async function streakRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.get(
    "/",
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ["streak"],
        security: [{ bearerAuth: [] }],
        response: {
            200: readingStreakSchema,
        },
      },
    },
    async (request, reply) => {
      const streak = await getStreakForUser(request.user.id);
      return reply.status(200).send(streak);
    }
  );
}
