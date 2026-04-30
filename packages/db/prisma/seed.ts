import {
  PrismaClient,
  TitleStatus,
  TitleType,
  UserRole,
  VideoAssetStatus,
  VideoQuality
} from "@prisma/client";
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
      update: {
        stripePriceId: "price_movth_basic"
      },
      create: {
        name: "Basic",
        maxProfiles: 2,
        maxStreams: 1,
        has4k: false,
        priceCents: 1990,
        stripePriceId: "price_movth_basic"
      }
    }),
    prisma.plan.upsert({
      where: { name: "Standard" },
      update: {
        stripePriceId: "price_movth_standard"
      },
      create: {
        name: "Standard",
        maxProfiles: 4,
        maxStreams: 2,
        has4k: false,
        priceCents: 3290,
        stripePriceId: "price_movth_standard"
      }
    }),
    prisma.plan.upsert({
      where: { name: "Premium" },
      update: {
        stripePriceId: "price_movth_premium"
      },
      create: {
        name: "Premium",
        maxProfiles: 6,
        maxStreams: 4,
        has4k: true,
        priceCents: 4990,
        stripePriceId: "price_movth_premium"
      }
    })
  ]);

  await prisma.user.upsert({
    where: { email: "admin@movth.test" },
    update: {
      planId: premium.id,
      passwordHash: adminPasswordHash,
      role: UserRole.ADMIN
    },
    create: {
      email: "admin@movth.test",
      passwordHash: adminPasswordHash,
      role: UserRole.ADMIN,
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

  const genres = [
    { name: "Acao", slug: "acao" },
    { name: "Drama", slug: "drama" },
    { name: "Suspense", slug: "suspense" },
    { name: "Ficcao cientifica", slug: "ficcao-cientifica" },
    { name: "Familia", slug: "familia" }
  ];
  const genreMap = new Map<string, string>();

  for (const genreSeed of genres) {
    const genre = await prisma.genre.upsert({
      where: { slug: genreSeed.slug },
      update: {
        name: genreSeed.name
      },
      create: genreSeed
    });

    genreMap.set(genre.slug, genre.id);
  }

  const titles = [
    {
      type: TitleType.MOVIE,
      title: "A Ultima Janela",
      synopsis: "Uma restauradora descobre transmissoes antigas escondidas em filmes perdidos.",
      releaseYear: 2024,
      rating: "14",
      tmdbId: 910001,
      posterUrl: "https://cdn.example.com/posters/a-ultima-janela.jpg",
      backdropUrl: "https://cdn.example.com/backdrops/a-ultima-janela.jpg",
      genres: ["suspense", "drama"],
      episodes: []
    },
    {
      type: TitleType.SERIES,
      title: "Orbita Sul",
      synopsis: "Tripulantes de uma estacao privada investigam sabotagens em baixa orbita.",
      releaseYear: 2025,
      rating: "12",
      tmdbId: 910002,
      posterUrl: "https://cdn.example.com/posters/orbita-sul.jpg",
      backdropUrl: "https://cdn.example.com/backdrops/orbita-sul.jpg",
      genres: ["ficcao-cientifica", "suspense"],
      episodes: [
        { season: 1, number: 1, durationS: 2760 },
        { season: 1, number: 2, durationS: 2810 },
        { season: 1, number: 3, durationS: 2690 }
      ]
    },
    {
      type: TitleType.MOVIE,
      title: "Rua das Mares",
      synopsis: "Um drama costeiro sobre familia, memoria e uma cidade que muda de lugar.",
      releaseYear: 2023,
      rating: "16",
      tmdbId: 910003,
      posterUrl: "https://cdn.example.com/posters/rua-das-mares.jpg",
      backdropUrl: "https://cdn.example.com/backdrops/rua-das-mares.jpg",
      genres: ["drama"],
      episodes: []
    },
    {
      type: TitleType.SERIES,
      title: "Codigo Aurora",
      synopsis: "Analistas de seguranca descobrem um padrao impossivel em ataques globais.",
      releaseYear: 2026,
      rating: "16",
      tmdbId: 910004,
      posterUrl: "https://cdn.example.com/posters/codigo-aurora.jpg",
      backdropUrl: "https://cdn.example.com/backdrops/codigo-aurora.jpg",
      genres: ["acao", "ficcao-cientifica"],
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
      posterUrl: "https://cdn.example.com/posters/pequenos-gigantes.jpg",
      backdropUrl: "https://cdn.example.com/backdrops/pequenos-gigantes.jpg",
      genres: ["familia"],
      episodes: []
    }
  ];

  for (const titleSeed of titles) {
    const title = await prisma.title.upsert({
      where: { tmdbId: titleSeed.tmdbId },
      update: {
        status: TitleStatus.READY,
        title: titleSeed.title,
        synopsis: titleSeed.synopsis,
        releaseYear: titleSeed.releaseYear,
        rating: titleSeed.rating,
        posterUrl: titleSeed.posterUrl,
        backdropUrl: titleSeed.backdropUrl
      },
      create: {
        type: titleSeed.type,
        status: TitleStatus.READY,
        title: titleSeed.title,
        synopsis: titleSeed.synopsis,
        releaseYear: titleSeed.releaseYear,
        rating: titleSeed.rating,
        posterUrl: titleSeed.posterUrl,
        backdropUrl: titleSeed.backdropUrl,
        tmdbId: titleSeed.tmdbId
      }
    });

    await prisma.titleGenre.deleteMany({
      where: { titleId: title.id }
    });
    await prisma.titleGenre.createMany({
      data: titleSeed.genres.map((slug) => {
        const genreId = genreMap.get(slug);

        if (!genreId) {
          throw new Error(`Missing genre for slug ${slug}`);
        }

        return {
          titleId: title.id,
          genreId
        };
      }),
      skipDuplicates: true
    });

    if (titleSeed.type === TitleType.MOVIE) {
      const existingMovieAsset = await prisma.videoAsset.findFirst({
        where: {
          titleId: title.id,
          episodeId: null,
          quality: VideoQuality.HD
        }
      });

      const movieAssetData = {
        hlsManifestUrl: `https://cdn.example.com/hls/titles/${title.id}/hd/master.m3u8`,
        thumbnailUrl: `https://cdn.example.com/thumbnails/titles/${title.id}.jpg`,
        status: VideoAssetStatus.READY
      };

      if (existingMovieAsset) {
        await prisma.videoAsset.update({
          where: { id: existingMovieAsset.id },
          data: movieAssetData
        });
      } else {
        await prisma.videoAsset.create({
          data: {
            titleId: title.id,
            quality: VideoQuality.HD,
            ...movieAssetData
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
        update: {
          thumbnailUrl: `https://cdn.example.com/thumbnails/episodes/${episode.id}.jpg`
        },
        create: {
          titleId: title.id,
          episodeId: episode.id,
          quality: VideoQuality.HD,
          hlsManifestUrl: `https://cdn.example.com/hls/episodes/${episode.id}/hd/master.m3u8`,
          thumbnailUrl: `https://cdn.example.com/thumbnails/episodes/${episode.id}.jpg`,
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
