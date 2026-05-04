import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma, TitleStatus, VideoAssetStatus } from "@movth/db";
import { badRequest, notFound, unauthorized } from "../lib/api-error.js";
import { sendCreated, sendData, sendNoContent } from "../lib/reply.js";
import { requireAuth } from "../middleware/require-auth.js";

const profileQuerySchema = z.object({
  profileId: z.string().uuid()
});

const paginatedProfileQuerySchema = profileQuerySchema.extend({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(50).default(20)
});

const historyBodySchema = z.object({
  profileId: z.string().uuid(),
  titleId: z.string().uuid(),
  episodeId: z.string().uuid().optional(),
  positionS: z.number().int().min(0).max(24 * 60 * 60),
  completed: z.boolean().default(false)
});

const watchlistBodySchema = z.object({
  profileId: z.string().uuid(),
  titleId: z.string().uuid()
});

const titleParamsSchema = z.object({
  titleId: z.string().uuid()
});

function requireUserId(request: { authUser?: { userId: string } }) {
  if (!request.authUser) {
    throw unauthorized();
  }

  return request.authUser.userId;
}

async function ensureProfileOwner(profileId: string, userId: string) {
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

async function ensurePlayableTitle(titleId: string) {
  const title = await prisma.title.findFirst({
    where: {
      id: titleId,
      status: TitleStatus.READY
    },
    select: {
      id: true
    }
  });

  if (!title) {
    throw notFound("TITLE_NOT_FOUND", "Title not found");
  }
}

async function ensureEpisodeBelongsToTitle(input: {
  titleId: string;
  episodeId?: string | undefined;
}) {
  if (!input.episodeId) {
    return;
  }

  const episode = await prisma.episode.findFirst({
    where: {
      id: input.episodeId,
      titleId: input.titleId
    },
    select: {
      id: true
    }
  });

  if (!episode) {
    throw badRequest("EPISODE_TITLE_MISMATCH", "Episode does not belong to the title");
  }
}

function publicTitle(title: {
  id: string;
  type: string;
  title: string;
  synopsis: string;
  releaseYear: number;
  rating: string;
  posterUrl: string | null;
  backdropUrl: string | null;
  genres: Array<{ genre: { id: string; name: string; slug: string } }>;
  videoAssets: Array<{
    id: string;
    quality: string;
    status: string;
    thumbnailUrl: string | null;
  }>;
}) {
  return {
    id: title.id,
    type: title.type,
    title: title.title,
    synopsis: title.synopsis,
    releaseYear: title.releaseYear,
    rating: title.rating,
    posterUrl: title.posterUrl,
    backdropUrl: title.backdropUrl,
    genres: title.genres.map(({ genre }) => genre),
    assets: title.videoAssets.map((asset) => ({
      id: asset.id,
      quality: asset.quality,
      status: asset.status,
      thumbnailUrl: asset.thumbnailUrl
    }))
  };
}

function historyInclude() {
  return {
    title: {
      include: {
        genres: {
          include: {
            genre: true
          }
        },
        videoAssets: {
          where: {
            status: VideoAssetStatus.READY
          },
          orderBy: {
            quality: "asc" as const
          }
        }
      }
    },
    episode: true
  };
}

function publicHistoryItem(item: {
  id: string;
  profileId: string;
  titleId: string;
  episodeId: string | null;
  positionS: number;
  completed: boolean;
  updatedAt: Date;
  title: Parameters<typeof publicTitle>[0];
  episode: {
    id: string;
    season: number;
    number: number;
    durationS: number;
  } | null;
}) {
  return {
    id: item.id,
    profileId: item.profileId,
    titleId: item.titleId,
    episodeId: item.episodeId,
    positionS: item.positionS,
    completed: item.completed,
    updatedAt: item.updatedAt,
    title: publicTitle(item.title),
    episode: item.episode
      ? {
          id: item.episode.id,
          season: item.episode.season,
          number: item.episode.number,
          durationS: item.episode.durationS
        }
      : null
  };
}

export async function engagementRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  app.post("/history", async (request, reply) => {
    const userId = requireUserId(request);
    const body = historyBodySchema.parse(request.body);
    await ensureProfileOwner(body.profileId, userId);
    await ensurePlayableTitle(body.titleId);
    await ensureEpisodeBelongsToTitle(body);

    const existingHistory = await prisma.watchHistory.findFirst({
      where: {
        profileId: body.profileId,
        titleId: body.titleId,
        episodeId: body.episodeId ?? null
      }
    });

    const history = existingHistory
      ? await prisma.watchHistory.update({
          where: { id: existingHistory.id },
          data: {
            positionS: body.positionS,
            completed: body.completed
          },
          include: historyInclude()
        })
      : await prisma.watchHistory.create({
          data: {
            profileId: body.profileId,
            titleId: body.titleId,
            ...(body.episodeId ? { episodeId: body.episodeId } : {}),
            positionS: body.positionS,
            completed: body.completed
          },
          include: historyInclude()
        });

    return sendData(reply, publicHistoryItem(history));
  });

  app.get("/history", async (request, reply) => {
    const userId = requireUserId(request);
    const query = paginatedProfileQuerySchema.parse(request.query);
    await ensureProfileOwner(query.profileId, userId);

    const skip = (query.page - 1) * query.pageSize;
    const where = {
      profileId: query.profileId
    };
    const [history, total] = await Promise.all([
      prisma.watchHistory.findMany({
        where,
        include: historyInclude(),
        orderBy: { updatedAt: "desc" },
        skip,
        take: query.pageSize
      }),
      prisma.watchHistory.count({ where })
    ]);

    return sendData(
      reply,
      history.map(publicHistoryItem),
      { page: query.page, pageSize: query.pageSize, total }
    );
  });

  app.get("/continue-watching", async (request, reply) => {
    const userId = requireUserId(request);
    const query = profileQuerySchema.parse(request.query);
    await ensureProfileOwner(query.profileId, userId);

    const history = await prisma.watchHistory.findMany({
      where: {
        profileId: query.profileId,
        completed: false,
        positionS: {
          gt: 0
        },
        title: {
          status: TitleStatus.READY
        }
      },
      include: historyInclude(),
      orderBy: { updatedAt: "desc" },
      take: 50
    });
    const latestByTitle = new Map<string, (typeof history)[number]>();

    for (const item of history) {
      if (latestByTitle.has(item.titleId)) {
        continue;
      }

      if (item.episode && item.positionS / item.episode.durationS >= 0.95) {
        continue;
      }

      latestByTitle.set(item.titleId, item);
    }

    return sendData(reply, Array.from(latestByTitle.values()).slice(0, 20).map(publicHistoryItem));
  });

  app.post("/watchlist", async (request, reply) => {
    const userId = requireUserId(request);
    const body = watchlistBodySchema.parse(request.body);
    await ensureProfileOwner(body.profileId, userId);
    await ensurePlayableTitle(body.titleId);

    const item = await prisma.watchlist.upsert({
      where: {
        profileId_titleId: {
          profileId: body.profileId,
          titleId: body.titleId
        }
      },
      create: {
        profileId: body.profileId,
        titleId: body.titleId
      },
      update: {},
      include: {
        title: {
          include: {
            genres: {
              include: {
                genre: true
              }
            },
            videoAssets: {
              where: {
                status: VideoAssetStatus.READY
              },
              orderBy: {
                quality: "asc"
              }
            }
          }
        }
      }
    });

    return sendCreated(reply, {
      profileId: item.profileId,
      titleId: item.titleId,
      createdAt: item.createdAt,
      title: publicTitle(item.title)
    });
  });

  app.delete("/watchlist/:titleId", async (request, reply) => {
    const userId = requireUserId(request);
    const params = titleParamsSchema.parse(request.params);
    const query = profileQuerySchema.parse(request.query);
    await ensureProfileOwner(query.profileId, userId);

    await prisma.watchlist.deleteMany({
      where: {
        profileId: query.profileId,
        titleId: params.titleId
      }
    });

    return sendNoContent(reply);
  });

  app.get("/watchlist", async (request, reply) => {
    const userId = requireUserId(request);
    const query = paginatedProfileQuerySchema.parse(request.query);
    await ensureProfileOwner(query.profileId, userId);

    const skip = (query.page - 1) * query.pageSize;
    const where = {
      profileId: query.profileId
    };
    const [items, total] = await Promise.all([
      prisma.watchlist.findMany({
        where,
        include: {
          title: {
            include: {
              genres: {
                include: {
                  genre: true
                }
              },
              videoAssets: {
                where: {
                  status: VideoAssetStatus.READY
                },
                orderBy: {
                  quality: "asc"
                }
              }
            }
          }
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: query.pageSize
      }),
      prisma.watchlist.count({ where })
    ]);

    return sendData(
      reply,
      items.map((item) => ({
        profileId: item.profileId,
        titleId: item.titleId,
        createdAt: item.createdAt,
        title: publicTitle(item.title)
      })),
      { page: query.page, pageSize: query.pageSize, total }
    );
  });
}
