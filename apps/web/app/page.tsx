import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Carousel } from "./components/Carousel";
import { LogoutButton } from "./components/LogoutButton";
import { TitleCard } from "./components/TitleCard";
import { WatchlistButton } from "./components/WatchlistButton";
import {
  PROFILE_COOKIE,
  type DiscoveryHomeResponse,
  type WatchHistoryItem,
  type WatchlistItem,
  requireUser,
  serverApi
} from "./lib/session";

function progressLabel(item: WatchHistoryItem) {
  const isExternal = item.title.assets?.some(
    (asset) => asset.status === "READY" && asset.source === "EMBED"
  );
  const minutes = Math.floor(item.positionS / 60);

  if (item.episode) {
    if (isExternal && minutes < 1) {
      return `T${item.episode.season}:E${item.episode.number} - iniciado`;
    }

    return `T${item.episode.season}:E${item.episode.number} - ${minutes} min`;
  }

  if (isExternal && minutes < 1) {
    return "Iniciado";
  }

  return `${minutes} min assistidos`;
}

function titleIdsFromWatchlist(items: WatchlistItem[]) {
  return new Set(items.map((item) => item.titleId));
}

async function getHomeData(profileId: string) {
  const discovery = await serverApi<DiscoveryHomeResponse>(
    `/discovery/home?profileId=${profileId}`
  );
  const rows = discovery.body.data?.rows;

  return {
    hero: discovery.body.data?.hero ?? null,
    continueWatching: rows?.continueWatching ?? [],
    watchlist: rows?.watchlist ?? [],
    popular: rows?.popular ?? [],
    movies: rows?.movies ?? [],
    series: rows?.series ?? [],
    recent: rows?.recent ?? [],
    genres: rows?.genres ?? []
  };
}

export default async function HomePage() {
  const user = await requireUser();
  const profileId = cookies().get(PROFILE_COOKIE)?.value;

  if (!profileId) {
    redirect("/profiles");
  }

  const homeData = await getHomeData(profileId);
  const genreRows = homeData.genres;
  const heroTitle = homeData.hero ?? homeData.recent[0];
  const watchlistIds = titleIdsFromWatchlist(homeData.watchlist);
  const heroHasPlayableAsset = Boolean(heroTitle?.assets?.some((asset) => asset.status === "READY"));

  return (
    <main className="home-page catalog-home">
      <nav className="top-nav">
        <p className="brand-mark">Movth</p>
        <div className="nav-actions">
          {user.role === "ADMIN" ? <a href="/admin">Admin</a> : null}
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
              {heroHasPlayableAsset ? (
                <a className="primary-action" href={`/play/title/${heroTitle.id}`}>
                  Play Assistir
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

        <Carousel title="Populares no Movth">
          {homeData.popular.map((title) => (
            <TitleCard
              inWatchlist={watchlistIds.has(title.id)}
              key={title.id}
              profileId={profileId}
              title={title}
            />
          ))}
        </Carousel>

        <Carousel title="Filmes">
          {homeData.movies.map((title) => (
            <TitleCard
              inWatchlist={watchlistIds.has(title.id)}
              key={title.id}
              profileId={profileId}
              title={title}
            />
          ))}
        </Carousel>

        <Carousel title="Series">
          {homeData.series.map((title) => (
            <TitleCard
              inWatchlist={watchlistIds.has(title.id)}
              key={title.id}
              profileId={profileId}
              title={title}
            />
          ))}
        </Carousel>

        <Carousel title="Adicionados recentemente">
          {homeData.recent.map((title) => (
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
