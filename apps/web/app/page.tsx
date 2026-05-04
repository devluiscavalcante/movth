import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Carousel } from "./components/Carousel";
import { LogoutButton } from "./components/LogoutButton";
import { TitleCard } from "./components/TitleCard";
import { WatchlistButton } from "./components/WatchlistButton";
import {
  PROFILE_COOKIE,
  type Genre,
  type Title,
  type WatchHistoryItem,
  type WatchlistItem,
  requireUser,
  serverApi
} from "./lib/session";

function progressLabel(item: WatchHistoryItem) {
  if (item.episode) {
    return `T${item.episode.season}:E${item.episode.number} · ${Math.floor(item.positionS / 60)} min`;
  }

  return `${Math.floor(item.positionS / 60)} min assistidos`;
}

function titleIdsFromWatchlist(items: WatchlistItem[]) {
  return new Set(items.map((item) => item.titleId));
}

async function getHomeData(profileId: string) {
  const [titles, genres, continueWatching, watchlist] = await Promise.all([
    serverApi<Title[]>("/titles?pageSize=20"),
    serverApi<Genre[]>("/genres"),
    serverApi<WatchHistoryItem[]>(`/continue-watching?profileId=${profileId}`),
    serverApi<WatchlistItem[]>(`/watchlist?profileId=${profileId}&pageSize=20`)
  ]);

  return {
    titles: titles.body.data ?? [],
    genres: genres.body.data ?? [],
    continueWatching: continueWatching.body.data ?? [],
    watchlist: watchlist.body.data ?? []
  };
}

async function getTitlesByGenre(genres: Genre[]) {
  const selectedGenres = genres.slice(0, 4);
  const results = await Promise.all(
    selectedGenres.map(async (genre) => {
      const response = await serverApi<Title[]>(
        `/titles?genre=${encodeURIComponent(genre.slug)}&pageSize=12`
      );

      return {
        genre,
        titles: response.body.data ?? []
      };
    })
  );

  return results.filter((group) => group.titles.length > 0);
}

export default async function HomePage() {
  const user = await requireUser();
  const profileId = cookies().get(PROFILE_COOKIE)?.value;

  if (!profileId) {
    redirect("/profiles");
  }

  const homeData = await getHomeData(profileId);
  const genreRows = await getTitlesByGenre(homeData.genres);
  const heroTitle = homeData.titles[0];
  const watchlistIds = titleIdsFromWatchlist(homeData.watchlist);
  const heroAsset = heroTitle?.assets?.find((asset) => asset.status === "READY");

  return (
    <main className="home-page catalog-home">
      <nav className="top-nav">
        <p className="brand-mark">Movth</p>
        <div className="nav-actions">
          <a href="/search">Busca</a>
          <a href="/account">Conta</a>
          <a href="/profiles">Perfis</a>
          <span>{user.plan?.name ?? "Sem plano"}</span>
          <LogoutButton />
        </div>
      </nav>

      {heroTitle ? (
        <section
          className="catalog-hero"
          style={
            heroTitle.backdropUrl
              ? {
                  backgroundImage: `linear-gradient(90deg, #0a0a0a 0%, rgba(10, 10, 10, 0.78) 42%, rgba(10, 10, 10, 0.2) 100%), url(${heroTitle.backdropUrl})`
                }
              : undefined
          }
        >
          <div className="catalog-hero-copy">
            <p className="eyebrow">Destaque</p>
            <h1>{heroTitle.title}</h1>
            <p>{heroTitle.synopsis}</p>
            <div className="title-facts">
              <span>{heroTitle.releaseYear}</span>
              <span>{heroTitle.rating}</span>
              <span>{heroTitle.type === "MOVIE" ? "Filme" : "Serie"}</span>
            </div>
            <div className="hero-actions">
              {heroAsset ? (
                <a className="primary-action" href={`/watch/${heroAsset.id}`}>
                  ▶ Assistir
                </a>
              ) : null}
              <WatchlistButton
                initialInWatchlist={watchlistIds.has(heroTitle.id)}
                profileId={profileId}
                titleId={heroTitle.id}
              />
            </div>
          </div>
        </section>
      ) : null}

      <div className="catalog-content">
        <Carousel title="Continue assistindo">
          {homeData.continueWatching.map((item) => (
            <TitleCard
              inWatchlist={watchlistIds.has(item.titleId)}
              key={item.id}
              profileId={profileId}
              progressLabel={progressLabel(item)}
              title={item.title}
            />
          ))}
        </Carousel>

        <Carousel title="Minha lista">
          {homeData.watchlist.map((item) => (
            <TitleCard
              inWatchlist
              key={item.titleId}
              profileId={profileId}
              title={item.title}
            />
          ))}
        </Carousel>

        <Carousel title="Adicionados recentemente">
          {homeData.titles.map((title) => (
            <TitleCard
              inWatchlist={watchlistIds.has(title.id)}
              key={title.id}
              profileId={profileId}
              title={title}
            />
          ))}
        </Carousel>

        {genreRows.map((row) => (
          <Carousel key={row.genre.id} title={row.genre.name}>
            {row.titles.map((title) => (
              <TitleCard
                inWatchlist={watchlistIds.has(title.id)}
                key={title.id}
                profileId={profileId}
                title={title}
              />
            ))}
          </Carousel>
        ))}
      </div>
    </main>
  );
}
