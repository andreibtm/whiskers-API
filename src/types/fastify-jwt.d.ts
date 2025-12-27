import "@fastify/jwt";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { sub: string; id: string; role: "USER" | "ADMIN"; email: string };
    user: { id: string; sub: string; role: "USER" | "ADMIN"; email: string };
  }
}
