import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import authRoutes from "./modules/auth/auth.routes.js";
import bookRoutes from "./modules/books/book.routes.js";
import progressRoutes from "./modules/progress/progress.routes.js";
import noteRoutes from "./modules/notes/note.routes.js";
import userRoutes from "./modules/users/user.routes.js";
import sessionRoutes from "./modules/reading-sessions/session.routes.js";
import streakRoutes from "./modules/reading-sessions/streak.routes.js";
import analyticsRoutes from "./modules/analytics/analytics.routes.js";
import goalRoutes from "./modules/goals/goal.routes.js";
import postRoutes from "./modules/posts/post.routes.js";
import feedRoutes from "./modules/feed/feed.routes.js";

export default async function registerRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.register(authRoutes, { prefix: "/auth" });
  server.register(bookRoutes, { prefix: "/books" });
  server.register(progressRoutes, { prefix: "/books" });
  server.register(noteRoutes);
  server.register(userRoutes, { prefix: "/users" });
  server.register(sessionRoutes, { prefix: "/sessions" });
  server.register(streakRoutes, { prefix: "/streak" });
  server.register(analyticsRoutes, { prefix: "/analytics" });
  server.register(goalRoutes, { prefix: "/goals" });
  server.register(postRoutes, { prefix: "/posts" });
  server.register(feedRoutes, { prefix: "/feed" });
}
