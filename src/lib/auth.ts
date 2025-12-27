import type { Role, User } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import bcrypt from "bcrypt";
import { env } from "../config/env.js";

const SALT_ROUNDS = 10;

export const hashPassword = (password: string) => bcrypt.hash(password, SALT_ROUNDS);

export const verifyPassword = (password: string, hash: string) => bcrypt.compare(password, hash);

export type TokenPayload = {
  sub: string;
  id: string;
  role: Role;
  email: string;
};

export const signAccessToken = (app: FastifyInstance, payload: TokenPayload) =>
  app.jwt.sign(payload, { expiresIn: env.ACCESS_TOKEN_EXPIRES_IN });

export const signRefreshToken = (app: FastifyInstance, payload: TokenPayload) =>
  app.jwt.sign(payload, {
    expiresIn: env.REFRESH_TOKEN_EXPIRES_IN,
    secret: env.JWT_REFRESH_SECRET,
  });

export type PublicUserDTO = {
  id: string;
  username: string | null;
  avatar: string | null;
};

export const toPublicUserProfile = (user: { id: string; username?: string | null; avatar?: string | null }): PublicUserDTO => ({
  id: user.id,
  username: user.username ?? null,
  avatar: user.avatar ?? null,
});

export const toPublicUser = (user: User) => ({
  id: user.id,
  email: user.email,
  role: user.role,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});
