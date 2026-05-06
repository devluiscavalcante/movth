import { prisma, TitleStatus, TitleType, VideoAssetStatus, VideoQuality } from "@movth/db";
import { env } from "../config/env.js";
import {
  discoverTmdb,
  getTmdbMovieDetails,
  getTmdbSeasonDetails,
  getTmdbTvDetails,
  tmdbBackdropUrl,
  tmdbPosterUrl,
  tmdbReleaseYear,
  type TmdbGenre,
  type TmdbMediaType
} from "../lib/tmdb.js";

type ImportStats = {
  created: number;
  skipped: number;
  failed: number;
};

const moviePages = Number(process.env.TMDB_IMPORT_MOVIE_PAGES ?? 10);
const tvPages = Number(process.env.TMDB_IMPORT_TV_PAGES ?? 10);
const maxSeasons = Number(process.env.TMDB_IMPORT_MAX_SEASONS ?? 1);
const maxEpisodesPerSeason = Number(process.env.TMDB_IMPORT_MAX_EPISODES_PER_SEASON ?? 6);
const withDemoAssets = process.env.TMDB_IMPORT_WITH_DEMO_ASSETS === "true";

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
  await prisma.videoAsset.create({
    data: {
      titleId,
      ...(episodeId ? { episodeId } : {}),
      quality: VideoQuality.HD,
      hlsManifestUrl,
      thumbnailUrl,
      status: VideoAssetStatus.READY
    }
  });
}

async function importMovie(tmdbId: number) {
  const existingTitle = await prisma.title.findUnique({
    where: { tmdbId }
  });

  if (existingTitle) {
    return "skipped";
  }

  const details = await getTmdbMovieDetails(tmdbId);
  const releaseYear = tmdbReleaseYear(details.release_date);

  if (!releaseYear) {
    return "failed";
  }

  const title = await prisma.title.create({
    data: {
      type: TitleType.MOVIE,
      status: TitleStatus.READY,
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

  if (withDemoAssets) {
    await createDemoAsset(title.id, null, env.DEMO_MOVIE_HLS_URL, tmdbPosterUrl(details.poster_path));
  }

  return "created";
}

async function importTv(tmdbId: number) {
  const existingTitle = await prisma.title.findUnique({
    where: { tmdbId }
  });

  if (existingTitle) {
    return "skipped";
  }

  const details = await getTmdbTvDetails(tmdbId);
  const releaseYear = tmdbReleaseYear(details.first_air_date);

  if (!releaseYear) {
    return "failed";
  }

  const title = await prisma.title.create({
    data: {
      type: TitleType.SERIES,
      status: TitleStatus.READY,
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

  const seasonLimit = Math.min(details.number_of_seasons, maxSeasons);
  const fallbackDurationS = (details.episode_run_time[0] ?? 42) * 60;

  for (let seasonNumber = 1; seasonNumber <= seasonLimit; seasonNumber += 1) {
    const season = await getTmdbSeasonDetails(details.id, seasonNumber);
    const episodes = season.episodes
      .filter((episode) => episode.episode_number > 0)
      .slice(0, maxEpisodesPerSeason);

    for (const episode of episodes) {
      const savedEpisode = await prisma.episode.create({
        data: {
          titleId: title.id,
          season: season.season_number,
          number: episode.episode_number,
          durationS: (episode.runtime ?? fallbackDurationS / 60) * 60
        }
      });

      if (withDemoAssets) {
        await createDemoAsset(title.id, savedEpisode.id, env.DEMO_SERIES_HLS_URL, tmdbPosterUrl(details.poster_path));
      }
    }
  }

  return "created";
}

async function importDiscovered(type: TmdbMediaType, pages: number) {
  const stats: ImportStats = {
    created: 0,
    skipped: 0,
    failed: 0
  };

  for (let page = 1; page <= pages; page += 1) {
    const discovered = await discoverTmdb(type, page);

    for (const item of discovered.results) {
      try {
        const result = type === "movie" ? await importMovie(item.id) : await importTv(item.id);
        stats[result] += 1;
      } catch (error) {
        stats.failed += 1;
        console.warn(`Failed to import ${type}:${item.id}`, error);
      }
    }
  }

  return stats;
}

async function main() {
  console.log("Importing TMDB catalog metadata", {
    moviePages,
    tvPages,
    maxSeasons,
    maxEpisodesPerSeason,
    withDemoAssets
  });

  const movies = await importDiscovered("movie", moviePages);
  const series = await importDiscovered("tv", tvPages);

  console.log(JSON.stringify({ movies, series }, null, 2));
}

await main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
