import { randomBytes, createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { env } from "../config/env.js";
import { redis } from "./redis.js";

const REFRESH_PREFIX = "auth:refresh:";

export type AccessTokenPayload = {
  sub: string;
  email: string;
};

function refreshKey(refreshToken: string) {
  return `${REFRESH_PREFIX}${createHash("sha256").update(refreshToken).digest("hex")}`;
}

export async function createRefreshToken(userId: string) {
  const token = randomBytes(48).toString("base64url");
  await redis.set(refreshKey(token), userId, "EX", env.REFRESH_TOKEN_TTL_SECONDS);
  return token;
}

export async function consumeRefreshToken(refreshToken: string) {
  const key = refreshKey(refreshToken);
  const userId = await redis.get(key);

  if (userId) {
    await redis.del(key);
  }

  return userId;
}

export async function revokeRefreshToken(refreshToken: string) {
  await redis.del(refreshKey(refreshToken));
}

export async function issueTokenPair(
  app: FastifyInstance,
  user: { id: string; email: string }
) {
  const accessToken = app.jwt.sign(
    {
      sub: user.id,
      email: user.email
    },
    {
      expiresIn: env.ACCESS_TOKEN_TTL
    }
  );
  const refreshToken = await createRefreshToken(user.id);

  return {
    accessToken,
    refreshToken,
    tokenType: "Bearer" as const,
    expiresIn: 15 * 60
  };
}
