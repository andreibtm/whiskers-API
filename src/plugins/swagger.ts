import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import fp from "fastify-plugin";

export default fp(async (app) => {
  await app.register(swagger, {
    openapi: {
      info: {
        title: "Whiskers API",
        version: "1.0.0",
        description: "REST API for the Whiskers reading companion app",
      },
      tags: [
        { name: "auth", description: "Authentication and token refresh" },
        { name: "books", description: "Book CRUD and status updates" },
        { name: "progress", description: "Per-book reading progress" },
        { name: "notes", description: "Per-book notes" },
        { name: "users", description: "User profile and follow relationships" },
        { name: "sessions", description: "Reading session capture (pomodoro/free)" },
        { name: "streak", description: "Reading streak stats" },
        { name: "analytics", description: "Reading analytics summaries" },
        { name: "goals", description: "Yearly reading goals" },
        { name: "posts", description: "Social posts, likes, comments" },
        { name: "feed", description: "Social feed aggregation" },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
          },
        },
        schemas: {
          PaginationMeta: {
            type: "object",
            properties: {
              page: { type: "integer", format: "int32", minimum: 1 },
              limit: { type: "integer", format: "int32", minimum: 1 },
              total: { type: "integer", format: "int32", minimum: 0 },
              totalPages: { type: "integer", format: "int32", minimum: 0 },
            },
            required: ["page", "limit", "total", "totalPages"],
          },
          ErrorResponse: {
            type: "object",
            properties: {
              message: { type: "string" },
            },
            required: ["message"],
          },
        },
        responses: {
          BadRequest: {
            description: "Bad Request",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
          Unauthorized: {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
          Forbidden: {
            description: "Forbidden",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
          NotFound: {
            description: "Not Found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
          Conflict: {
            description: "Conflict",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
    },
  });

  await app.register(swaggerUi, {
    routePrefix: "/docs",
    staticCSP: true,
    uiConfig: {
      docExpansion: "list",
      deepLinking: false,
    },
  });
});
