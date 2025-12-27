import { Role } from "@prisma/client";
import { z } from "zod";

export const userSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  role: z.nativeEnum(Role),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const publicUserSchema = z.object({
  id: z.string().uuid(),
  username: z.string().nullable(),
  avatar: z.string().nullable(),
});

export const authTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
});

export const authResponseSchema = z.object({
  user: userSchema,
  accessToken: z.string(),
  refreshToken: z.string(),
});

export const registerBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const loginBodySchema = registerBodySchema;

export const refreshBodySchema = z.object({
  refreshToken: z.string().min(1),
});
