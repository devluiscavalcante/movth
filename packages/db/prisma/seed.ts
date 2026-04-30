import { PrismaClient, TitleType, VideoAssetStatus, VideoQuality } from "@prisma/client";
import { hash } from "@node-rs/argon2";

const prisma = new PrismaClient();

function passwordForSeed(value: string) {
  return hash(value, {
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1
  });
}

async function main() {
  const adminPasswordHash = await passwordForSeed("movth-admin-password");
  const [basic, standard, premium] = await Promise.all([
    prisma.plan.upsert({
      where: { name: "Basic" },
      update: {},
      create: {
        name: "Basic",
        maxProfiles: 2,
        maxStreams: 1,
        has4k: false,
        priceCents: 1990
      }
    }),
    prisma.plan.upsert({
      where: { name: "Standard" },
      update: {},
      create: {
        name: "Standard",
        maxProfiles: 4,
        maxStreams: 2,
        has4k: false,
        priceCents: 3290
      }
    }),
    prisma.plan.upsert({
      where: { name: "Premium" },
      update: {},
      create: {
        name: "Premium",
        maxProfiles: 6,
        maxStreams: 4,
        has4k: true,
        priceCents: 4990
      }
    })
  ]);

  await prisma.user.upsert({
    where: { email: "admin@movth.test" },
    update: {
      planId: premium.id,
      passwordHash: adminPasswordHash
    },
    create: {
      email: "admin@movth.test",
      passwordHash: adminPasswordHash,
      planId: premium.id,
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      profiles: {
        create: [
          {
            name: "Admin",
            avatarUrl: "https://cdn.example.com/avatars/admin.png",
            isKids: false
          },
          {
            name: "Kids",
            avatarUrl: "https://cdn.example.com/avatars/kids.png",
            isKids: true
          }
        ]
      }
    }
  });

  const titles = [
    {
      type: TitleType.MOVIE,
      title: "A Ultima Janela",
      synopsis: "Uma restauradora descobre transmissões antigas escondidas em filmes perdidos.",
      releaseYear: 2024,
      rating: "14",
      tmdbId: 910001,
      episodes: []
    },
    {
      type: TitleType.SERIES,
      title: "Orbita Sul",
      synopsis: "Tripulantes de uma estacao privada investigam sabotagens em baixa orbita.",
      releaseYear: 2025,
      rating: "12",
      tmdbId: 910002,
      episodes: [
        { season: 1, number: 1, durationS: 2760 },
        { season: 1, number: 2, durationS: 2810 },
        { season: 1, number: 3, durationS: 2690 }
      ]
    },
    {
      type: TitleType.MOVIE,
      title: "Rua das Marés",
      synopsis: "Um drama costeiro sobre familia, memoria e uma cidade que muda de lugar.",
      releaseYear: 2023,
      rating: "16",
      tmdbId: 910003,
      episodes: []
    },
    {
      type: TitleType.SERIES,
      title: "Código Aurora",
      synopsis: "Analistas de seguranca descobrem um padrao impossivel em ataques globais.",
      releaseYear: 2026,
      rating: "16",
      tmdbId: 910004,
      episodes: [
        { season: 1, number: 1, durationS: 3180 },
        { season: 1, number: 2, durationS: 3020 }
      ]
    },
    {
      type: TitleType.MOVIE,
      title: "Pequenos Gigantes",
      synopsis: "Uma aventura familiar sobre criancas que constroem um festival de invencoes.",
      releaseYear: 2022,
      rating: "L",
      tmdbId: 910005,
      episodes: []
    }
  ];

  for (const titleSeed of titles) {
    const title = await prisma.title.upsert({
      where: { tmdbId: titleSeed.tmdbId },
      update: {
        title: titleSeed.title,
        synopsis: titleSeed.synopsis,
        releaseYear: titleSeed.releaseYear,
        rating: titleSeed.rating
      },
      create: {
        type: titleSeed.type,
        title: titleSeed.title,
        synopsis: titleSeed.synopsis,
        releaseYear: titleSeed.releaseYear,
        rating: titleSeed.rating,
        tmdbId: titleSeed.tmdbId
      }
    });

    if (titleSeed.type === TitleType.MOVIE) {
      const existingMovieAsset = await prisma.videoAsset.findFirst({
        where: {
          titleId: title.id,
          episodeId: null,
          quality: VideoQuality.HD
        }
      });

      if (existingMovieAsset) {
        await prisma.videoAsset.update({
          where: { id: existingMovieAsset.id },
          data: {
            hlsManifestUrl: `https://cdn.example.com/hls/titles/${title.id}/hd/master.m3u8`,
            status: VideoAssetStatus.READY
          }
        });
      } else {
        await prisma.videoAsset.create({
          data: {
          titleId: title.id,
          quality: VideoQuality.HD,
          hlsManifestUrl: `https://cdn.example.com/hls/titles/${title.id}/hd/master.m3u8`,
          status: VideoAssetStatus.READY
          }
        });
      }
    }

    for (const episodeSeed of titleSeed.episodes) {
      const episode = await prisma.episode.upsert({
        where: {
          titleId_season_number: {
            titleId: title.id,
            season: episodeSeed.season,
            number: episodeSeed.number
          }
        },
        update: {
          durationS: episodeSeed.durationS
        },
        create: {
          titleId: title.id,
          season: episodeSeed.season,
          number: episodeSeed.number,
          durationS: episodeSeed.durationS
        }
      });

      await prisma.videoAsset.upsert({
        where: {
          titleId_episodeId_quality: {
            titleId: title.id,
            episodeId: episode.id,
            quality: VideoQuality.HD
          }
        },
        update: {},
        create: {
          titleId: title.id,
          episodeId: episode.id,
          quality: VideoQuality.HD,
          hlsManifestUrl: `https://cdn.example.com/hls/episodes/${episode.id}/hd/master.m3u8`,
          status: VideoAssetStatus.READY
        }
      });
    }
  }

  console.info("Seed completed", {
    plans: [basic.name, standard.name, premium.name],
    adminEmail: "admin@movth.test"
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
