import rateLimit from "@fastify/rate-limit";
import fp from "fastify-plugin";
import { env } from "../config/env.js";

export default fp(async (app) => {
  await app.register(rateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW,
    allowList: [],
  });
});
