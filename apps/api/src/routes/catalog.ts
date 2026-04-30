import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma, TitleStatus, TitleType } from "@movth/db";
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
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(50).default(20)
});

function titleInclude() {
  return {
    genres: {
      include: {
        genre: true
      }
    },
    videoAssets: true
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
}) {
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
    assets: title.videoAssets?.map((asset) => ({
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
      }
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
