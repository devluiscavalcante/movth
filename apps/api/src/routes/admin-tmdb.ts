import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma, TitleStatus, TitleType, VideoAssetStatus, VideoQuality } from "@movth/db";
import { env } from "../config/env.js";
import { badRequest, conflict } from "../lib/api-error.js";
import { sendCreated, sendData } from "../lib/reply.js";
import {
  getTmdbMovieDetails,
  getTmdbSeasonDetails,
  getTmdbTvDetails,
  searchTmdb,
  tmdbBackdropUrl,
  tmdbPosterUrl,
  tmdbReleaseYear,
  type TmdbGenre
} from "../lib/tmdb.js";
import { requireAdmin } from "../middleware/require-admin.js";
import { requireAuth } from "../middleware/require-auth.js";

const searchSchema = z.object({
  q: z.string().trim().min(1),
  type: z.enum(["movie", "tv"]).default("movie"),
  page: z.coerce.number().int().positive().default(1)
});

const importSchema = z.object({
  tmdbId: z.number().int().positive(),
  type: z.enum(["movie", "tv"]),
  withDemoAsset: z.boolean().default(true),
  maxSeasons: z.number().int().positive().max(5).default(1),
  maxEpisodesPerSeason: z.number().int().positive().max(12).default(6)
});

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function ratingFromVoteAverage(value?: number | null) {
  if (!value) {
    return "14";
  }

  if (value >= 7.5) {
    return "12";
  }

  if (value >= 6) {
    return "14";
  }

  return "16";
}

async function ensureGenres(genres: TmdbGenre[]) {
  const savedGenres = [];

  for (const genre of genres) {
    const name = genre.name.trim();
    const savedGenre = await prisma.genre.upsert({
      where: { slug: slugify(name) },
      update: { name },
      create: {
        name,
        slug: slugify(name)
      }
    });
    savedGenres.push(savedGenre);
  }

  return savedGenres;
}

async function attachGenres(titleId: string, genres: TmdbGenre[]) {
  const savedGenres = await ensureGenres(genres);

  await prisma.titleGenre.createMany({
    data: savedGenres.map((genre) => ({
      titleId,
      genreId: genre.id
    })),
    skipDuplicates: true
  });
}

async function createDemoAsset(titleId: string, episodeId: string | null, hlsManifestUrl: string, thumbnailUrl: string | null) {
  const existingAsset = await prisma.videoAsset.findFirst({
    where: {
      titleId,
      episodeId,
      quality: VideoQuality.HD
    }
  });

  if (existingAsset) {
    return prisma.videoAsset.update({
      where: { id: existingAsset.id },
      data: {
        hlsManifestUrl,
        thumbnailUrl,
        status: VideoAssetStatus.READY
      }
    });
  }

  return prisma.videoAsset.create({
    data: {
      titleId,
      ...(episodeId ? { episodeId } : {}),
      quality: VideoQuality.HD,
      hlsManifestUrl,
      thumbnailUrl,
      status: VideoAssetStatus.READY
    },
  });
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

export async function adminTmdbRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);
  app.addHook("preHandler", requireAdmin);

  app.get("/tmdb/search", async (request, reply) => {
    const query = searchSchema.parse(request.query);
    const result = await searchTmdb(query.q, query.type, query.page);

    return sendData(reply, result.results, {
      page: result.page,
      total: result.total,
      totalPages: result.totalPages
    });
  });

  app.post("/tmdb/import", async (request, reply) => {
    const body = importSchema.parse(request.body);
    const existingTitle = await prisma.title.findUnique({
      where: { tmdbId: body.tmdbId }
    });

    if (existingTitle) {
      throw conflict("TMDB_ID_EXISTS", "A title with this TMDB id already exists");
    }

    if (body.type === "movie") {
      const details = await getTmdbMovieDetails(body.tmdbId);
      const releaseYear = tmdbReleaseYear(details.release_date);

      if (!releaseYear) {
        throw badRequest("TMDB_RELEASE_YEAR_MISSING", "TMDB movie release year is required");
      }

      const title = await prisma.title.create({
        data: {
          type: TitleType.MOVIE,
          status: body.withDemoAsset ? TitleStatus.READY : TitleStatus.DRAFT,
          title: details.title,
          synopsis: details.overview || "Sinopse indisponivel.",
          releaseYear,
          rating: ratingFromVoteAverage(details.vote_average),
          posterUrl: tmdbPosterUrl(details.poster_path),
          backdropUrl: tmdbBackdropUrl(details.backdrop_path),
          tmdbId: details.id
        }
      });

      await attachGenres(title.id, details.genres);

      if (body.withDemoAsset) {
        await createDemoAsset(title.id, null, env.DEMO_MOVIE_HLS_URL, tmdbPosterUrl(details.poster_path));
      }

      const importedTitle = await prisma.title.findUniqueOrThrow({
        where: { id: title.id },
        include: titleInclude()
      });

      return sendCreated(reply, importedTitle);
    }

    const details = await getTmdbTvDetails(body.tmdbId);
    const releaseYear = tmdbReleaseYear(details.first_air_date);

    if (!releaseYear) {
      throw badRequest("TMDB_RELEASE_YEAR_MISSING", "TMDB series release year is required");
    }

    const title = await prisma.title.create({
      data: {
        type: TitleType.SERIES,
        status: body.withDemoAsset ? TitleStatus.READY : TitleStatus.DRAFT,
        title: details.name,
        synopsis: details.overview || "Sinopse indisponivel.",
        releaseYear,
        rating: ratingFromVoteAverage(details.vote_average),
        posterUrl: tmdbPosterUrl(details.poster_path),
        backdropUrl: tmdbBackdropUrl(details.backdrop_path),
        tmdbId: details.id
      }
    });

    await attachGenres(title.id, details.genres);

    const seasonLimit = Math.min(details.number_of_seasons, body.maxSeasons);
    const fallbackDurationS = (details.episode_run_time[0] ?? 42) * 60;

    for (let seasonNumber = 1; seasonNumber <= seasonLimit; seasonNumber += 1) {
      const season = await getTmdbSeasonDetails(details.id, seasonNumber);
      const episodes = season.episodes
        .filter((episode) => episode.episode_number > 0)
        .slice(0, body.maxEpisodesPerSeason);

      for (const episode of episodes) {
        const savedEpisode = await prisma.episode.create({
          data: {
            titleId: title.id,
            season: season.season_number,
            number: episode.episode_number,
            durationS: (episode.runtime ?? fallbackDurationS / 60) * 60
          }
        });

        if (body.withDemoAsset) {
          await createDemoAsset(
            title.id,
            savedEpisode.id,
            env.DEMO_SERIES_HLS_URL,
            tmdbPosterUrl(details.poster_path)
          );
        }
      }
    }

    const importedTitle = await prisma.title.findUniqueOrThrow({
      where: { id: title.id },
      include: titleInclude()
    });

    return sendCreated(reply, importedTitle);
  });
}
