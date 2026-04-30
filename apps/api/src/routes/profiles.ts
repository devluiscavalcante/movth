import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@movth/db";
import { badRequest, conflict, forbidden, notFound, unauthorized } from "../lib/api-error.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { sendCreated, sendData, sendNoContent } from "../lib/reply.js";
import { requireAuth } from "../middleware/require-auth.js";

const profileParamsSchema = z.object({
  id: z.string().uuid()
});

const createProfileSchema = z.object({
  name: z.string().trim().min(1).max(40),
  avatarUrl: z.string().url().optional(),
  isKids: z.boolean().default(false),
  pin: z.string().regex(/^\d{4,8}$/).optional()
});

const updateProfileSchema = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  avatarUrl: z.string().url().nullable().optional(),
  isKids: z.boolean().optional()
});

const pinSchema = z.object({
  pin: z.string().regex(/^\d{4,8}$/)
});

function requireUserId(request: { authUser?: { userId: string } }) {
  if (!request.authUser) {
    throw unauthorized();
  }

  return request.authUser.userId;
}

function publicProfile(profile: {
  id: string;
  name: string;
  avatarUrl: string | null;
  isKids: boolean;
  pinHash: string | null;
}) {
  return {
    id: profile.id,
    name: profile.name,
    avatarUrl: profile.avatarUrl,
    isKids: profile.isKids,
    hasPin: Boolean(profile.pinHash)
  };
}

async function ensureProfileOwner(profileId: string, userId: string) {
  const profile = await prisma.profile.findFirst({
    where: {
      id: profileId,
      userId
    }
  });

  if (!profile) {
    throw notFound("PROFILE_NOT_FOUND", "Profile not found");
  }

  return profile;
}

export async function profileRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  app.get("/", async (request, reply) => {
    const userId = requireUserId(request);
    const profiles = await prisma.profile.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" }
    });

    return sendData(reply, profiles.map(publicProfile));
  });

  app.post("/", async (request, reply) => {
    const userId = requireUserId(request);
    const body = createProfileSchema.parse(request.body);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        plan: true,
        _count: {
          select: { profiles: true }
        }
      }
    });

    if (!user?.plan) {
      throw forbidden("PLAN_REQUIRED", "A plan is required to create profiles");
    }

    if (user._count.profiles >= user.plan.maxProfiles) {
      throw forbidden("PROFILE_LIMIT_REACHED", "Profile limit reached for the current plan");
    }

    const existingProfile = await prisma.profile.findUnique({
      where: {
        userId_name: {
          userId,
          name: body.name
        }
      }
    });

    if (existingProfile) {
      throw conflict("PROFILE_NAME_EXISTS", "A profile with this name already exists");
    }

    const profile = await prisma.profile.create({
      data: {
        userId,
        name: body.name,
        isKids: body.isKids,
        ...(body.avatarUrl ? { avatarUrl: body.avatarUrl } : {}),
        ...(body.pin ? { pinHash: await hashPassword(body.pin) } : {})
      }
    });

    return sendCreated(reply, publicProfile(profile));
  });

  app.patch("/:id", async (request, reply) => {
    const userId = requireUserId(request);
    const params = profileParamsSchema.parse(request.params);
    const body = updateProfileSchema.parse(request.body);
    await ensureProfileOwner(params.id, userId);

    if (body.name) {
      const profileWithName = await prisma.profile.findUnique({
        where: {
          userId_name: {
            userId,
            name: body.name
          }
        }
      });

      if (profileWithName && profileWithName.id !== params.id) {
        throw conflict("PROFILE_NAME_EXISTS", "A profile with this name already exists");
      }
    }

    const updateData = {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.avatarUrl !== undefined ? { avatarUrl: body.avatarUrl } : {}),
      ...(body.isKids !== undefined ? { isKids: body.isKids } : {})
    };

    const profile = await prisma.profile.update({
      where: { id: params.id },
      data: updateData
    });

    return sendData(reply, publicProfile(profile));
  });

  app.delete("/:id", async (request, reply) => {
    const userId = requireUserId(request);
    const params = profileParamsSchema.parse(request.params);
    await ensureProfileOwner(params.id, userId);

    const profileCount = await prisma.profile.count({
      where: { userId }
    });

    if (profileCount <= 1) {
      throw badRequest("LAST_PROFILE", "At least one profile must remain on the account");
    }

    await prisma.profile.delete({
      where: { id: params.id }
    });

    return sendNoContent(reply);
  });

  app.post("/:id/pin", async (request, reply) => {
    const userId = requireUserId(request);
    const params = profileParamsSchema.parse(request.params);
    const body = pinSchema.parse(request.body);
    const profile = await ensureProfileOwner(params.id, userId);

    const valid = profile.pinHash ? await verifyPassword(profile.pinHash, body.pin) : true;
    return sendData(reply, { valid });
  });
}
