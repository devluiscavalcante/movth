import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma, TitleType, VideoAssetStatus, VideoQuality, VideoSource } from "@movth/db";
import { badRequest, forbidden, notFound, unauthorized } from "../lib/api-error.js";
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

const playTitleParamsSchema = z.object({
  titleId: z.string().uuid()
});

const playTitleQuerySchema = z.object({
  profileId: z.string().uuid()
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

async function assertProfileOwner(profileId: string, userId: string) {
  const profile = await prisma.profile.findFirst({
    where: {
      id: profileId,
      userId
    },
    select: {
      id: true
    }
  });

  if (!profile) {
    throw notFound("PROFILE_NOT_FOUND", "Profile not found");
  }
}

function playableAssetFromList<T extends { id: string; status: VideoAssetStatus; quality: VideoQuality; source: VideoSource }>(
  assets: T[]
) {
  return (
    assets.find(
      (asset) =>
        asset.status === VideoAssetStatus.READY &&
        asset.quality === VideoQuality.HD &&
        asset.source === VideoSource.HLS
    ) ??
    assets.find((asset) => asset.status === VideoAssetStatus.READY && asset.source === VideoSource.HLS) ??
    assets.find(
      (asset) =>
        asset.status === VideoAssetStatus.READY &&
        asset.quality === VideoQuality.HD &&
        asset.source === VideoSource.EMBED
    ) ??
    assets.find((asset) => asset.status === VideoAssetStatus.READY && asset.source === VideoSource.EMBED) ??
    null
  );
}

async function resolvePlayableAsset(titleId: string, profileId: string) {
  const title = await prisma.title.findUnique({
    where: { id: titleId },
    include: {
      videoAssets: {
        where: {
          episodeId: null,
          status: VideoAssetStatus.READY
        }
      },
      episodes: {
        include: {
          videoAssets: {
            where: {
              status: VideoAssetStatus.READY
            }
          }
        },
        orderBy: [{ season: "asc" }, { number: "asc" }]
      }
    }
  });

  if (!title) {
    throw notFound("TITLE_NOT_FOUND", "Title not found");
  }

  if (title.type === TitleType.MOVIE) {
    const asset = playableAssetFromList(title.videoAssets);

    if (!asset) {
      throw notFound("ASSET_NOT_FOUND", "Playable asset not found");
    }

    return {
      asset,
      reason: "movie"
    };
  }

  const latestHistory = await prisma.watchHistory.findFirst({
    where: {
      profileId,
      titleId,
      completed: false,
      positionS: {
        gt: 0
      }
    },
    include: {
      episode: true
    },
    orderBy: {
      updatedAt: "desc"
    }
  });

  if (latestHistory?.episodeId) {
    const currentEpisode = title.episodes.find((episode) => episode.id === latestHistory.episodeId);
    const asset = currentEpisode ? playableAssetFromList(currentEpisode.videoAssets) : null;

    if (asset) {
      return {
        asset,
        reason: "resume"
      };
    }
  }

  const firstPlayableEpisode = title.episodes.find((episode) => playableAssetFromList(episode.videoAssets));
  const asset = firstPlayableEpisode ? playableAssetFromList(firstPlayableEpisode.videoAssets) : null;

  if (!asset) {
    throw notFound("ASSET_NOT_FOUND", "Playable episode asset not found");
  }

  return {
    asset,
    reason: "first_episode"
  };
}

async function nextEpisodeAsset(input: { titleId: string; episodeId: string | null }) {
  if (!input.episodeId) {
    return null;
  }

  const currentEpisode = await prisma.episode.findUnique({
    where: { id: input.episodeId },
    select: {
      season: true,
      number: true
    }
  });

  if (!currentEpisode) {
    return null;
  }

  const nextEpisode = await prisma.episode.findFirst({
    where: {
      titleId: input.titleId,
      OR: [
        {
          season: currentEpisode.season,
          number: {
            gt: currentEpisode.number
          }
        },
        {
          season: {
            gt: currentEpisode.season
          }
        }
      ],
      videoAssets: {
        some: {
          status: VideoAssetStatus.READY
        }
      }
    },
    include: {
      videoAssets: {
        where: {
          status: VideoAssetStatus.READY
        }
      }
    },
    orderBy: [{ season: "asc" }, { number: "asc" }]
  });

  if (!nextEpisode) {
    return null;
  }

  const asset = playableAssetFromList(nextEpisode.videoAssets);

  if (!asset) {
    return null;
  }

  return {
    assetId: asset.id,
    episodeId: nextEpisode.id,
    season: nextEpisode.season,
    number: nextEpisode.number
  };
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

  const reusableSession = await prisma.activeSession.findFirst({
    where: {
      userId: input.userId,
      deviceType: input.deviceType,
      ipAddress: input.ipAddress,
      lastSeen: {
        gte: activeSince
      }
    },
    orderBy: {
      lastSeen: "desc"
    }
  });

  if (reusableSession) {
    return prisma.activeSession.update({
      where: { id: reusableSession.id },
      data: {
        lastSeen: new Date()
      }
    });
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
    "/play/title/:titleId",
    {
      preHandler: [requireAuth, requireActivePlan]
    },
    async (request, reply) => {
      if (!request.authUser) {
        throw unauthorized();
      }

      const params = playTitleParamsSchema.parse(request.params);
      const query = playTitleQuerySchema.parse(request.query);
      await assertProfileOwner(query.profileId, request.authUser.userId);
      const resolved = await resolvePlayableAsset(params.titleId, query.profileId);

      if (!resolved.asset) {
        throw badRequest("PLAYBACK_NOT_RESOLVED", "Could not resolve playback target");
      }

      return sendData(reply, {
        titleId: params.titleId,
        assetId: resolved.asset.id,
        episodeId: resolved.asset.episodeId,
        reason: resolved.reason
      });
    }
  );

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

      if (asset.source === VideoSource.HLS && qualityRank(asset.quality) > maxQualityRankForPlan(user.plan)) {
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
      const nextEpisode = await nextEpisodeAsset({
        titleId: asset.titleId,
        episodeId: asset.episodeId
      });

      return sendData(reply, {
        assetId: asset.id,
        titleId: asset.titleId,
        episodeId: asset.episodeId,
        quality: asset.quality,
        playbackSource: asset.source,
        manifestUrl: asset.hlsManifestUrl,
        expiresAt,
        sessionId: session.id,
        title: {
          id: asset.title.id,
          type: asset.title.type,
          title: asset.title.title,
          releaseYear: asset.title.releaseYear,
          rating: asset.title.rating
        },
        episode: asset.episode
          ? {
              id: asset.episode.id,
              season: asset.episode.season,
              number: asset.episode.number,
              durationS: asset.episode.durationS
            }
          : null,
        nextEpisode
      });
    }
  );
}
