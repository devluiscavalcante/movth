import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma, TitleStatus, TitleType, VideoAssetStatus } from "@movth/db";
import { notFound } from "../lib/api-error.js";
import { sendData } from "../lib/reply.js";

const listTitlesSchema = z.object({
  type: z.nativeEnum(TitleType).optional(),
  genre: z.string().trim().min(1).optional(),
  rating: z.string().trim().min(1).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(50).default(20)
});

const titleParamsSchema = z.object({
  id: z.string().uuid()
});

const searchSchema = z.object({
  q: z.string().trim().min(1),
  type: z.nativeEnum(TitleType).optional(),
  genre: z.string().trim().min(1).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(50).default(20)
});

const discoveryHomeSchema = z.object({
  profileId: z.string().uuid().optional()
});

function titleInclude() {
  return {
    genres: {
      include: {
        genre: true
      }
    },
    videoAssets: true,
    episodes: {
      include: {
        videoAssets: true
      }
    }
  };
}

function publicTitle(title: {
  id: string;
  type: TitleType;
  status: TitleStatus;
  title: string;
  synopsis: string;
  releaseYear: number;
  rating: string;
  posterUrl: string | null;
  backdropUrl: string | null;
  tmdbId: number | null;
  genres: Array<{ genre: { id: string; name: string; slug: string } }>;
  videoAssets?: Array<{ id: string; quality: string; status: string; thumbnailUrl: string | null }>;
  episodes?: Array<{
    videoAssets: Array<{ id: string; quality: string; status: string; thumbnailUrl: string | null }>;
  }>;
}) {
  const assets = [
    ...(title.videoAssets ?? []),
    ...(title.episodes ?? []).flatMap((episode) => episode.videoAssets)
  ];

  return {
    id: title.id,
    type: title.type,
    status: title.status,
    title: title.title,
    synopsis: title.synopsis,
    releaseYear: title.releaseYear,
    rating: title.rating,
    posterUrl: title.posterUrl,
    backdropUrl: title.backdropUrl,
    tmdbId: title.tmdbId,
    genres: title.genres.map(({ genre }) => genre),
    assets: assets.map((asset) => ({
      id: asset.id,
      quality: asset.quality,
      status: asset.status,
      thumbnailUrl: asset.thumbnailUrl
    }))
  };
}

function titleWhere(filters: z.infer<typeof listTitlesSchema>) {
  return {
    status: TitleStatus.READY,
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.rating ? { rating: filters.rating } : {}),
    ...(filters.genre
      ? {
          genres: {
            some: {
              genre: {
                slug: filters.genre
              }
            }
          }
        }
      : {})
  };
}

export async function catalogRoutes(app: FastifyInstance) {
  app.get("/genres", async (_request, reply) => {
    const genres = await prisma.genre.findMany({
      orderBy: { name: "asc" }
    });

    return sendData(reply, genres);
  });

  app.get("/titles/search", async (request, reply) => {
    const query = searchSchema.parse(request.query);
    const skip = (query.page - 1) * query.pageSize;
    const where = {
      status: TitleStatus.READY,
      title: {
        contains: query.q,
        mode: "insensitive" as const
      },
      ...(query.type ? { type: query.type } : {}),
      ...(query.genre
        ? {
            genres: {
              some: {
                genre: {
                  slug: query.genre
                }
              }
            }
          }
        : {})
    };
    const [titles, total] = await Promise.all([
      prisma.title.findMany({
        where,
        include: titleInclude(),
        orderBy: { title: "asc" },
        skip,
        take: query.pageSize
      }),
      prisma.title.count({ where })
    ]);

    return sendData(
      reply,
      titles.map(publicTitle),
      { page: query.page, pageSize: query.pageSize, total }
    );
  });

  app.get("/discovery/home", async (request, reply) => {
    const query = discoveryHomeSchema.parse(request.query);
    const titleWhereReady = {
      status: TitleStatus.READY
    };
    const [recent, movies, series, genres, watchlist, continueWatching] = await Promise.all([
      prisma.title.findMany({
        where: titleWhereReady,
        include: titleInclude(),
        orderBy: { createdAt: "desc" },
        take: 20
      }),
      prisma.title.findMany({
        where: {
          ...titleWhereReady,
          type: TitleType.MOVIE
        },
        include: titleInclude(),
        orderBy: { createdAt: "desc" },
        take: 20
      }),
      prisma.title.findMany({
        where: {
          ...titleWhereReady,
          type: TitleType.SERIES
        },
        include: titleInclude(),
        orderBy: { createdAt: "desc" },
        take: 20
      }),
      prisma.genre.findMany({
        orderBy: { name: "asc" },
        take: 6
      }),
      query.profileId
        ? prisma.watchlist.findMany({
            where: { profileId: query.profileId },
            include: {
              title: {
                include: titleInclude()
              }
            },
            orderBy: { createdAt: "desc" },
            take: 20
          })
        : Promise.resolve([]),
      query.profileId
        ? prisma.watchHistory.findMany({
            where: {
              profileId: query.profileId,
              completed: false,
              positionS: { gt: 0 },
              title: titleWhereReady
            },
            include: {
              title: {
                include: titleInclude()
              },
              episode: true
            },
            orderBy: { updatedAt: "desc" },
            take: 50
          })
        : Promise.resolve([])
    ]);
    const latestByTitle = new Map<string, (typeof continueWatching)[number]>();

    for (const item of continueWatching) {
      if (!latestByTitle.has(item.titleId)) {
        latestByTitle.set(item.titleId, item);
      }
    }

    const genreRows = await Promise.all(
      genres.slice(0, 4).map(async (genre) => {
        const titles = await prisma.title.findMany({
          where: {
            ...titleWhereReady,
            genres: {
              some: {
                genre: {
                  slug: genre.slug
                }
              }
            }
          },
          include: titleInclude(),
          orderBy: { createdAt: "desc" },
          take: 12
        });

        return {
          genre,
          titles: titles.map(publicTitle)
        };
      })
    );
    const popular = Array.from(
      new Map(
        [
          ...Array.from(latestByTitle.values()).map((item) => item.title),
          ...watchlist.map((item) => item.title),
          ...recent
        ].map((title) => [title.id, title])
      ).values()
    );
    const hero =
      recent.find((title) => title.backdropUrl && title.tmdbId) ??
      recent.find((title) => title.backdropUrl) ??
      recent[0] ??
      null;

    return sendData(reply, {
      hero: hero ? publicTitle(hero) : null,
      rows: {
        continueWatching: Array.from(latestByTitle.values()).slice(0, 20).map((item) => ({
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
        })),
        watchlist: watchlist.map((item) => ({
          profileId: item.profileId,
          titleId: item.titleId,
          createdAt: item.createdAt,
          title: publicTitle(item.title)
        })),
        popular: popular.slice(0, 20).map(publicTitle),
        movies: movies.map(publicTitle),
        series: series.map(publicTitle),
        recent: recent.map(publicTitle),
        genres: genreRows.filter((row) => row.titles.length > 0)
      }
    });
  });

  app.get("/titles", async (request, reply) => {
    const query = listTitlesSchema.parse(request.query);
    const skip = (query.page - 1) * query.pageSize;
    const where = titleWhere(query);
    const [titles, total] = await Promise.all([
      prisma.title.findMany({
        where,
        include: titleInclude(),
        orderBy: { createdAt: "desc" },
        skip,
        take: query.pageSize
      }),
      prisma.title.count({ where })
    ]);

    return sendData(
      reply,
      titles.map(publicTitle),
      { page: query.page, pageSize: query.pageSize, total }
    );
  });

  app.get("/titles/:id", async (request, reply) => {
    const params = titleParamsSchema.parse(request.params);
    const title = await prisma.title.findFirst({
      where: {
        id: params.id,
        status: TitleStatus.READY
      },
      include: titleInclude()
    });

    if (!title) {
      throw notFound("TITLE_NOT_FOUND", "Title not found");
    }

    return sendData(reply, publicTitle(title));
  });

  app.get("/titles/:id/episodes", async (request, reply) => {
    const params = titleParamsSchema.parse(request.params);
    const title = await prisma.title.findFirst({
      where: {
        id: params.id,
        type: TitleType.SERIES,
        status: TitleStatus.READY
      },
      select: { id: true }
    });

    if (!title) {
      throw notFound("TITLE_NOT_FOUND", "Series title not found");
    }

    const episodes = await prisma.episode.findMany({
      where: { titleId: params.id },
      include: {
        videoAssets: true
      },
      orderBy: [{ season: "asc" }, { number: "asc" }]
    });
    const seasons = new Map<number, typeof episodes>();

    for (const episode of episodes) {
      const season = seasons.get(episode.season) ?? [];
      season.push(episode);
      seasons.set(episode.season, season);
    }

    return sendData(reply, {
      seasons: Array.from(seasons.entries()).map(([season, seasonEpisodes]) => ({
        season,
        episodes: seasonEpisodes
      }))
    });
  });
}
