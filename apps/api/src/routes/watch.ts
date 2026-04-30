import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma, VideoAssetStatus, VideoQuality } from "@movth/db";
import { forbidden, notFound, unauthorized } from "../lib/api-error.js";
import { sendData } from "../lib/reply.js";
import { requireActivePlan } from "../middleware/require-active-plan.js";
import { requireAuth } from "../middleware/require-auth.js";

const watchParamsSchema = z.object({
  assetId: z.string().uuid()
});

const watchQuerySchema = z.object({
  sessionId: z.string().uuid().optional(),
  deviceType: z.string().trim().min(1).max(40).default("web")
});

const STREAM_SESSION_TTL_MS = 5 * 60 * 1000;
const MANIFEST_TTL_MS = 2 * 60 * 60 * 1000;

function qualityRank(quality: VideoQuality) {
  switch (quality) {
    case VideoQuality.SD:
      return 1;
    case VideoQuality.HD:
      return 2;
    case VideoQuality.FULL_HD:
      return 3;
    case VideoQuality.UHD_4K:
      return 4;
  }
}

function maxQualityRankForPlan(plan: { name: string; has4k: boolean }) {
  if (plan.has4k) {
    return 4;
  }

  if (plan.name === "Standard") {
    return 3;
  }

  return 2;
}

function clientIp(request: FastifyRequest) {
  const forwardedFor = request.headers["x-forwarded-for"];

  if (typeof forwardedFor === "string" && forwardedFor.length > 0) {
    return forwardedFor.split(",")[0]?.trim() ?? request.ip;
  }

  return request.ip;
}

async function upsertStreamSession(input: {
  sessionId?: string;
  userId: string;
  maxStreams: number;
  deviceType: string;
  ipAddress: string;
}) {
  const activeSince = new Date(Date.now() - STREAM_SESSION_TTL_MS);

  await prisma.activeSession.deleteMany({
    where: {
      userId: input.userId,
      lastSeen: {
        lt: activeSince
      }
    }
  });

  if (input.sessionId) {
    const existingSession = await prisma.activeSession.findFirst({
      where: {
        id: input.sessionId,
        userId: input.userId
      }
    });

    if (existingSession) {
      return prisma.activeSession.update({
        where: { id: existingSession.id },
        data: {
          deviceType: input.deviceType,
          ipAddress: input.ipAddress,
          lastSeen: new Date()
        }
      });
    }
  }

  const activeSessionCount = await prisma.activeSession.count({
    where: {
      userId: input.userId,
      lastSeen: {
        gte: activeSince
      }
    }
  });

  if (activeSessionCount >= input.maxStreams) {
    throw forbidden("STREAM_LIMIT_REACHED", "Maximum simultaneous streams reached");
  }

  return prisma.activeSession.create({
    data: {
      userId: input.userId,
      deviceType: input.deviceType,
      ipAddress: input.ipAddress,
      lastSeen: new Date()
    }
  });
}

export async function watchRoutes(app: FastifyInstance) {
  app.get(
    "/watch/:assetId",
    {
      preHandler: [requireAuth, requireActivePlan]
    },
    async (request, reply) => {
      if (!request.authUser) {
        throw unauthorized();
      }

      const params = watchParamsSchema.parse(request.params);
      const query = watchQuerySchema.parse(request.query);
      const user = await prisma.user.findUnique({
        where: { id: request.authUser.userId },
        include: { plan: true }
      });

      if (!user?.plan) {
        throw forbidden("ACTIVE_PLAN_REQUIRED", "An active plan is required");
      }

      const asset = await prisma.videoAsset.findUnique({
        where: { id: params.assetId },
        include: {
          title: true,
          episode: true
        }
      });

      if (!asset || asset.status !== VideoAssetStatus.READY) {
        throw notFound("ASSET_NOT_FOUND", "Playable asset not found");
      }

      if (qualityRank(asset.quality) > maxQualityRankForPlan(user.plan)) {
        throw forbidden("QUALITY_NOT_ALLOWED", "Current plan does not allow this quality");
      }

      const session = await upsertStreamSession({
        ...(query.sessionId ? { sessionId: query.sessionId } : {}),
        userId: user.id,
        maxStreams: user.plan.maxStreams,
        deviceType: query.deviceType,
        ipAddress: clientIp(request)
      });
      const expiresAt = new Date(Date.now() + MANIFEST_TTL_MS);

      return sendData(reply, {
        assetId: asset.id,
        titleId: asset.titleId,
        episodeId: asset.episodeId,
        quality: asset.quality,
        manifestUrl: asset.hlsManifestUrl,
        expiresAt,
        sessionId: session.id
      });
    }
  );
}
