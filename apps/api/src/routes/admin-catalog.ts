import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma, TitleStatus, TitleType } from "@movth/db";
import { conflict, notFound } from "../lib/api-error.js";
import { sendCreated, sendData, sendNoContent } from "../lib/reply.js";
import { requireAdmin } from "../middleware/require-admin.js";
import { requireAuth } from "../middleware/require-auth.js";

const titleParamsSchema = z.object({
  id: z.string().uuid()
});

const listTitlesQuerySchema = z.object({
  q: z.string().trim().min(1).optional(),
  type: z.nativeEnum(TitleType).optional(),
  status: z.nativeEnum(TitleStatus).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50)
});

const episodeParamsSchema = z.object({
  id: z.string().uuid()
});

const titleBodySchema = z.object({
  type: z.nativeEnum(TitleType),
  status: z.nativeEnum(TitleStatus).default(TitleStatus.DRAFT),
  title: z.string().trim().min(1).max(180),
  synopsis: z.string().trim().min(1).max(2000),
  releaseYear: z.number().int().min(1888).max(2100),
  rating: z.string().trim().min(1).max(10),
  posterUrl: z.string().url().nullable().optional(),
  backdropUrl: z.string().url().nullable().optional(),
  tmdbId: z.number().int().positive().nullable().optional(),
  genreSlugs: z.array(z.string().trim().min(1)).default([])
});

const updateTitleSchema = titleBodySchema.partial().extend({
  genreSlugs: z.array(z.string().trim().min(1)).optional()
});

const episodeBodySchema = z.object({
  season: z.number().int().positive(),
  number: z.number().int().positive(),
  durationS: z.number().int().positive()
});

const updateEpisodeSchema = episodeBodySchema.partial();

async function replaceTitleGenres(titleId: string, genreSlugs: string[]) {
  const genres = await prisma.genre.findMany({
    where: {
      slug: {
        in: genreSlugs
      }
    }
  });

  if (genres.length !== genreSlugs.length) {
    throw notFound("GENRE_NOT_FOUND", "One or more genres were not found");
  }

  await prisma.titleGenre.deleteMany({
    where: { titleId }
  });

  if (genres.length > 0) {
    await prisma.titleGenre.createMany({
      data: genres.map((genre) => ({
        titleId,
        genreId: genre.id
      })),
      skipDuplicates: true
    });
  }
}

function titleInclude() {
  return {
    genres: {
      include: {
        genre: true
      }
    },
    episodes: true,
    videoAssets: true
  };
}

export async function adminCatalogRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);
  app.addHook("preHandler", requireAdmin);

  app.get("/titles", async (request, reply) => {
    const query = listTitlesQuerySchema.parse(request.query);
    const where = {
      ...(query.q
        ? {
            title: {
              contains: query.q,
              mode: "insensitive" as const
            }
          }
        : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.status ? { status: query.status } : {})
    };
    const skip = (query.page - 1) * query.pageSize;
    const [titles, total] = await Promise.all([
      prisma.title.findMany({
        where,
        include: titleInclude(),
        orderBy: {
          createdAt: "desc"
        },
        skip,
        take: query.pageSize
      }),
      prisma.title.count({ where })
    ]);

    return sendData(reply, titles, {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize)
    });
  });

  app.get("/titles/:id", async (request, reply) => {
    const params = titleParamsSchema.parse(request.params);
    const title = await prisma.title.findUnique({
      where: { id: params.id },
      include: titleInclude()
    });

    if (!title) {
      throw notFound("TITLE_NOT_FOUND", "Title not found");
    }

    return sendData(reply, title);
  });

  app.post("/titles", async (request, reply) => {
    const body = titleBodySchema.parse(request.body);

    if (body.tmdbId) {
      const existingTitle = await prisma.title.findUnique({
        where: { tmdbId: body.tmdbId }
      });

      if (existingTitle) {
        throw conflict("TMDB_ID_EXISTS", "A title with this TMDB id already exists");
      }
    }

    const title = await prisma.title.create({
      data: {
        type: body.type,
        status: body.status,
        title: body.title,
        synopsis: body.synopsis,
        releaseYear: body.releaseYear,
        rating: body.rating,
        ...(body.posterUrl !== undefined ? { posterUrl: body.posterUrl } : {}),
        ...(body.backdropUrl !== undefined ? { backdropUrl: body.backdropUrl } : {}),
        ...(body.tmdbId !== undefined ? { tmdbId: body.tmdbId } : {})
      }
    });

    await replaceTitleGenres(title.id, body.genreSlugs);

    const createdTitle = await prisma.title.findUniqueOrThrow({
      where: { id: title.id },
      include: titleInclude()
    });

    return sendCreated(reply, createdTitle);
  });

  app.patch("/titles/:id", async (request, reply) => {
    const params = titleParamsSchema.parse(request.params);
    const body = updateTitleSchema.parse(request.body);
    const existingTitle = await prisma.title.findUnique({
      where: { id: params.id }
    });

    if (!existingTitle) {
      throw notFound("TITLE_NOT_FOUND", "Title not found");
    }

    if (body.tmdbId && body.tmdbId !== existingTitle.tmdbId) {
      const titleWithTmdbId = await prisma.title.findUnique({
        where: { tmdbId: body.tmdbId }
      });

      if (titleWithTmdbId) {
        throw conflict("TMDB_ID_EXISTS", "A title with this TMDB id already exists");
      }
    }

    await prisma.title.update({
      where: { id: params.id },
      data: {
        ...(body.type !== undefined ? { type: body.type } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.synopsis !== undefined ? { synopsis: body.synopsis } : {}),
        ...(body.releaseYear !== undefined ? { releaseYear: body.releaseYear } : {}),
        ...(body.rating !== undefined ? { rating: body.rating } : {}),
        ...(body.posterUrl !== undefined ? { posterUrl: body.posterUrl } : {}),
        ...(body.backdropUrl !== undefined ? { backdropUrl: body.backdropUrl } : {}),
        ...(body.tmdbId !== undefined ? { tmdbId: body.tmdbId } : {})
      }
    });

    if (body.genreSlugs) {
      await replaceTitleGenres(params.id, body.genreSlugs);
    }

    const updatedTitle = await prisma.title.findUniqueOrThrow({
      where: { id: params.id },
      include: titleInclude()
    });

    return sendData(reply, updatedTitle);
  });

  app.delete("/titles/:id", async (request, reply) => {
    const params = titleParamsSchema.parse(request.params);
    const existingTitle = await prisma.title.findUnique({
      where: { id: params.id }
    });

    if (!existingTitle) {
      throw notFound("TITLE_NOT_FOUND", "Title not found");
    }

    await prisma.title.delete({
      where: { id: params.id }
    });

    return sendNoContent(reply);
  });

  app.post("/titles/:id/episodes", async (request, reply) => {
    const params = titleParamsSchema.parse(request.params);
    const body = episodeBodySchema.parse(request.body);
    const title = await prisma.title.findUnique({
      where: { id: params.id }
    });

    if (!title || title.type !== TitleType.SERIES) {
      throw notFound("TITLE_NOT_FOUND", "Series title not found");
    }

    const episode = await prisma.episode.create({
      data: {
        titleId: params.id,
        season: body.season,
        number: body.number,
        durationS: body.durationS
      }
    });

    return sendCreated(reply, episode);
  });

  app.patch("/episodes/:id", async (request, reply) => {
    const params = episodeParamsSchema.parse(request.params);
    const body = updateEpisodeSchema.parse(request.body);
    const existingEpisode = await prisma.episode.findUnique({
      where: { id: params.id }
    });

    if (!existingEpisode) {
      throw notFound("EPISODE_NOT_FOUND", "Episode not found");
    }

    const episode = await prisma.episode.update({
      where: { id: params.id },
      data: {
        ...(body.season !== undefined ? { season: body.season } : {}),
        ...(body.number !== undefined ? { number: body.number } : {}),
        ...(body.durationS !== undefined ? { durationS: body.durationS } : {})
      }
    });

    return sendData(reply, episode);
  });

  app.delete("/episodes/:id", async (request, reply) => {
    const params = episodeParamsSchema.parse(request.params);
    const existingEpisode = await prisma.episode.findUnique({
      where: { id: params.id }
    });

    if (!existingEpisode) {
      throw notFound("EPISODE_NOT_FOUND", "Episode not found");
    }

    await prisma.episode.delete({
      where: { id: params.id }
    });

    return sendNoContent(reply);
  });
}
