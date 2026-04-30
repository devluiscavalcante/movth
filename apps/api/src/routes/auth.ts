import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@movth/db";
import { badRequest, conflict, unauthorized } from "../lib/api-error.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { sendCreated, sendData, sendNoContent } from "../lib/reply.js";
import { consumeRefreshToken, issueTokenPair, revokeRefreshToken } from "../lib/tokens.js";
import { requireAuth } from "../middleware/require-auth.js";

const credentialsSchema = z.object({
  email: z.string().email().transform((value) => value.trim().toLowerCase()),
  password: z.string().min(8).max(128)
});

const refreshSchema = z.object({
  refreshToken: z.string().min(32)
});

function publicUser(user: {
  id: string;
  email: string;
  trialEndsAt: Date | null;
  plan: { id: string; name: string; maxProfiles: number; maxStreams: number; has4k: boolean } | null;
}) {
  return {
    id: user.id,
    email: user.email,
    trialEndsAt: user.trialEndsAt,
    plan: user.plan
  };
}

export async function authRoutes(app: FastifyInstance) {
  app.post(
    "/register",
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: "1 minute"
        }
      }
    },
    async (request, reply) => {
      const body = credentialsSchema.parse(request.body);
      const existingUser = await prisma.user.findUnique({
        where: { email: body.email }
      });

      if (existingUser) {
        throw conflict("EMAIL_ALREADY_REGISTERED", "Email is already registered");
      }

      const basicPlan = await prisma.plan.findUnique({
        where: { name: "Basic" }
      });

      const user = await prisma.user.create({
        data: {
          email: body.email,
          passwordHash: await hashPassword(body.password),
          trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
          ...(basicPlan
            ? {
                plan: {
                  connect: { id: basicPlan.id }
                }
              }
            : {}),
          profiles: {
            create: {
              name: "Principal",
              isKids: false
            }
          }
        },
        include: {
          plan: true
        }
      });

      const tokens = await issueTokenPair(app, user);

      return sendCreated(reply, {
        user: publicUser(user),
        ...tokens
      });
    }
  );

  app.post(
    "/login",
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: "1 minute"
        }
      }
    },
    async (request, reply) => {
      const body = credentialsSchema.parse(request.body);
      const user = await prisma.user.findUnique({
        where: { email: body.email },
        include: { plan: true }
      });

      if (!user || !(await verifyPassword(user.passwordHash, body.password))) {
        throw unauthorized("INVALID_CREDENTIALS", "Invalid email or password");
      }

      const tokens = await issueTokenPair(app, user);

      return sendData(reply, {
        user: publicUser(user),
        ...tokens
      });
    }
  );

  app.post("/refresh", async (request, reply) => {
    const body = refreshSchema.parse(request.body);
    const userId = await consumeRefreshToken(body.refreshToken);

    if (!userId) {
      throw unauthorized("INVALID_REFRESH_TOKEN", "Invalid refresh token");
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { plan: true }
    });

    if (!user) {
      throw unauthorized("INVALID_REFRESH_TOKEN", "Invalid refresh token");
    }

    const tokens = await issueTokenPair(app, user);
    return sendData(reply, {
      user: publicUser(user),
      ...tokens
    });
  });

  app.post("/logout", async (request, reply) => {
    const body = refreshSchema.parse(request.body);
    await revokeRefreshToken(body.refreshToken);
    return sendNoContent(reply);
  });

  app.get("/me", { preHandler: requireAuth }, async (request, reply) => {
    if (!request.authUser) {
      throw unauthorized();
    }

    const user = await prisma.user.findUnique({
      where: { id: request.authUser.userId },
      include: {
        plan: true
      }
    });

    if (!user) {
      throw badRequest("USER_NOT_FOUND", "Authenticated user no longer exists");
    }

    return sendData(reply, publicUser(user));
  });
}
