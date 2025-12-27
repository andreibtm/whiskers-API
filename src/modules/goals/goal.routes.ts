import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { errorSchema } from "../../lib/schemas.js";
import { createGoalBodySchema, goalParamsSchema, readingGoalSchema } from "./goal.schemas.js";
import { prisma } from "../../lib/prisma.js";
import { getGoal, upsertGoal } from "./goal.service.js";

export default async function goalRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.post(
    "/",
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ["goals"],
        body: createGoalBodySchema,
        security: [{ bearerAuth: [] }],
        response: {
          201: readingGoalSchema,
        },
      },
    },
    async (request, reply) => {
      const { year, targetBooks } = request.body;

      const existing = await prisma.readingGoal.findUnique({
        where: { userId_year: { userId: request.user.id, year } },
      });

      if (existing) {
        return reply.status(409).send({ message: "Goal for year already exists" });
      }

      const goal = await upsertGoal(request.user.id, year, targetBooks);
      return reply.status(201).send(goal);
    }
  );

  server.get(
    "/:year",
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ["goals"],
        params: goalParamsSchema,
        security: [{ bearerAuth: [] }],
        response: {
          200: readingGoalSchema,
        },
      },
    },
    async (request, reply) => {
      const { year } = request.params;
      const goal = await getGoal(request.user.id, year);
      if (!goal) {
        return reply.status(404).send({ message: "Goal not found" });
      }
      return reply.status(200).send(goal);
    }
  );
}
