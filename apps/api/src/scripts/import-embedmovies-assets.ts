import { prisma, TitleStatus, TitleType, VideoAssetStatus, VideoQuality, VideoSource } from "@movth/db";
import { env } from "../config/env.js";

type Stats = {
  moviesCreated: number;
  moviesUpdated: number;
  episodesCreated: number;
  episodesUpdated: number;
  skipped: number;
};

function embedBaseUrl() {
  return env.EMBEDMOVIES_BASE_URL.replace(/\/+$/, "");
}

function movieEmbedUrl(tmdbId: number) {
  return `${embedBaseUrl()}/filme/${tmdbId}`;
}

function episodeEmbedUrl(tmdbId: number, season: number, episode: number) {
  return `${embedBaseUrl()}/serie/${tmdbId}/${season}/${episode}`;
}

async function upsertEmbedAsset(input: {
  titleId: string;
  episodeId: string | null;
  url: string;
  thumbnailUrl: string | null;
}) {
  const existing = await prisma.videoAsset.findFirst({
    where: {
      titleId: input.titleId,
      episodeId: input.episodeId,
      quality: VideoQuality.HD,
      source: VideoSource.EMBED
    }
  });

  if (existing) {
    await prisma.videoAsset.update({
      where: { id: existing.id },
      data: {
        hlsManifestUrl: input.url,
        thumbnailUrl: input.thumbnailUrl,
        status: VideoAssetStatus.READY
      }
    });

    return "updated";
  }

  await prisma.videoAsset.create({
    data: {
      titleId: input.titleId,
      ...(input.episodeId ? { episodeId: input.episodeId } : {}),
      quality: VideoQuality.HD,
      source: VideoSource.EMBED,
      hlsManifestUrl: input.url,
      thumbnailUrl: input.thumbnailUrl,
      status: VideoAssetStatus.READY
    }
  });

  return "created";
}

async function main() {
  const titles = await prisma.title.findMany({
    where: {
      status: TitleStatus.READY,
      tmdbId: {
        not: null
      }
    },
    include: {
      episodes: {
        orderBy: [{ season: "asc" }, { number: "asc" }]
      }
    },
    orderBy: [{ type: "asc" }, { title: "asc" }]
  });
  const stats: Stats = {
    moviesCreated: 0,
    moviesUpdated: 0,
    episodesCreated: 0,
    episodesUpdated: 0,
    skipped: 0
  };

  for (const title of titles) {
    if (!title.tmdbId) {
      stats.skipped += 1;
      continue;
    }

    if (title.type === TitleType.MOVIE) {
      const result = await upsertEmbedAsset({
        titleId: title.id,
        episodeId: null,
        url: movieEmbedUrl(title.tmdbId),
        thumbnailUrl: title.posterUrl
      });

      if (result === "created") {
        stats.moviesCreated += 1;
      } else {
        stats.moviesUpdated += 1;
      }

      continue;
    }

    if (title.episodes.length === 0) {
      stats.skipped += 1;
      continue;
    }

    for (const episode of title.episodes) {
      const result = await upsertEmbedAsset({
        titleId: title.id,
        episodeId: episode.id,
        url: episodeEmbedUrl(title.tmdbId, episode.season, episode.number),
        thumbnailUrl: title.posterUrl
      });

      if (result === "created") {
        stats.episodesCreated += 1;
      } else {
        stats.episodesUpdated += 1;
      }
    }
  }

  console.log(JSON.stringify({ baseUrl: embedBaseUrl(), titles: titles.length, stats }, null, 2));
}

await main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
