import Image from "next/image";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { Carousel } from "../../components/Carousel";
import { LogoutButton } from "../../components/LogoutButton";
import { TitleCard } from "../../components/TitleCard";
import { WatchlistButton } from "../../components/WatchlistButton";
import {
  PROFILE_COOKIE,
  type EpisodesResponse,
  type Title,
  type WatchHistoryItem,
  type WatchlistItem,
  requireUser,
  serverApi
} from "../../lib/session";

type TitlePageProps = {
  params: {
    id: string;
  };
};

function firstReadyAsset(title: Title) {
  return title.assets?.find((asset) => asset.status === "READY") ?? title.assets?.[0];
}

function firstEpisodeAsset(seasons: EpisodesResponse["seasons"]) {
  for (const season of seasons) {
    for (const episode of season.episodes) {
      const asset =
        episode.videoAssets.find((item) => item.status === "READY") ?? episode.videoAssets[0];

      if (asset) {
        return asset;
      }
    }
  }

  return undefined;
}

function formatDuration(seconds: number) {
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `${minutes} min`;
}

function episodeProgress(history: WatchHistoryItem[], episodeId: string, durationS: number) {
  const item = history.find((entry) => entry.episodeId === episodeId);

  if (!item) {
    return {
      item: null,
      label: null,
      percent: 0
    };
  }

  const percent = item.completed
    ? 100
    : Math.min(95, Math.max(0, Math.round((item.positionS / Math.max(1, durationS)) * 100)));

  return {
    item,
    label: item.completed ? "Concluido" : `${Math.floor(item.positionS / 60)} min assistidos`,
    percent
  };
}

async function getTitlePageData(titleId: string, profileId: string) {
  const title = await serverApi<Title>(`/titles/${titleId}`);

  if (!title.ok || !title.body.data) {
    notFound();
  }

  const [episodes, watchlist, history, similar] = await Promise.all([
    title.body.data.type === "SERIES"
      ? serverApi<EpisodesResponse>(`/titles/${titleId}/episodes`)
      : Promise.resolve({ body: { data: { seasons: [] } } }),
    serverApi<WatchlistItem[]>(`/watchlist?profileId=${profileId}&pageSize=50`),
    serverApi<WatchHistoryItem[]>(`/history?profileId=${profileId}&pageSize=50`),
    title.body.data.genres[0]
      ? serverApi<Title[]>(
          `/titles?genre=${encodeURIComponent(title.body.data.genres[0].slug)}&pageSize=12`
        )
      : serverApi<Title[]>("/titles?pageSize=12")
  ]);

  return {
    title: title.body.data,
    seasons: episodes.body.data?.seasons ?? [],
    watchlist: watchlist.body.data ?? [],
    history: (history.body.data ?? []).filter((item) => item.titleId === titleId),
    similar: (similar.body.data ?? []).filter((item) => item.id !== titleId)
  };
}

export default async function TitlePage({ params }: TitlePageProps) {
  await requireUser();
  const profileId = cookies().get(PROFILE_COOKIE)?.value;

  if (!profileId) {
    redirect("/profiles");
  }

  const data = await getTitlePageData(params.id, profileId);
  const titleAsset = firstReadyAsset(data.title);
  const startAsset = data.title.type === "SERIES" ? firstEpisodeAsset(data.seasons) : titleAsset;
  const inWatchlist = data.watchlist.some((item) => item.titleId === data.title.id);
  const latestHistory = data.history.find((item) => !item.completed) ?? data.history[0];
  const progressMinutes = latestHistory ? Math.floor(latestHistory.positionS / 60) : 0;

  return (
    <main className="title-detail-page">
      <nav className="top-nav detail-nav">
        <a className="brand-mark" href="/">
          Movth
        </a>
        <div className="nav-actions">
          <a href="/search">Busca</a>
          <a href="/account">Conta</a>
          <a href="/profiles">Perfis</a>
          <LogoutButton />
        </div>
      </nav>

      <section
        className="title-detail-hero"
        style={
          data.title.backdropUrl
            ? {
                backgroundImage: `linear-gradient(90deg, #0a0a0a 0%, rgba(10, 10, 10, 0.82) 45%, rgba(10, 10, 10, 0.3) 100%), url(${data.title.backdropUrl})`
              }
            : undefined
        }
      >
        <div className="title-detail-copy">
          <p className="eyebrow">{data.title.type === "MOVIE" ? "Filme" : "Serie"}</p>
          <h1>{data.title.title}</h1>
          <div className="title-facts">
            <span>{data.title.releaseYear}</span>
            <span>{data.title.rating}</span>
            {data.title.genres.slice(0, 3).map((genre) => (
              <span key={genre.id}>{genre.name}</span>
            ))}
          </div>
          <p>{data.title.synopsis}</p>
          {latestHistory ? (
            <p className="detail-progress">
              {latestHistory.episode
                ? `Ultimo visto: T${latestHistory.episode.season}:E${latestHistory.episode.number} aos ${progressMinutes} min`
                : `Voce parou em ${progressMinutes} min`}
            </p>
          ) : null}
          <div className="hero-actions">
            {titleAsset || startAsset ? (
              <a className="primary-action" href={`/play/title/${data.title.id}`}>
                Play {latestHistory && !latestHistory.completed ? "Continuar" : "Assistir"}
              </a>
            ) : null}
            {latestHistory && startAsset ? (
              <a className="secondary-action" href={`/watch/${startAsset.id}?start=1`}>
                Assistir do inicio
              </a>
            ) : null}
            <WatchlistButton
              initialInWatchlist={inWatchlist}
              profileId={profileId}
              titleId={data.title.id}
            />
          </div>
        </div>
        {data.title.posterUrl ? (
          <div className="title-detail-poster">
            <Image alt="" fill sizes="280px" src={data.title.posterUrl} unoptimized />
          </div>
        ) : null}
      </section>

      {data.seasons.length > 0 ? (
        <section className="episodes-section">
          <h2>Episodios</h2>
          <div className="season-list">
            {data.seasons.map((season) => (
              <section className="season-group" key={season.season}>
                <h3>
                  Temporada {season.season}{" "}
                  <span>
                    {season.episodes.length} episodio{season.episodes.length === 1 ? "" : "s"}
                  </span>
                </h3>
                <div className="episode-list">
                  {season.episodes.map((episode) => {
                    const asset =
                      episode.videoAssets.find((item) => item.status === "READY") ??
                      episode.videoAssets[0];
                    const progress = episodeProgress(data.history, episode.id, episode.durationS);

                    return (
                      <article className="episode-row" key={episode.id}>
                        <div className="episode-copy">
                          <h4>Episodio {episode.number}</h4>
                          <p>
                            {formatDuration(episode.durationS)}
                            {episode.videoAssets.length > 0
                              ? ` - ${episode.videoAssets.length} versao${
                                  episode.videoAssets.length === 1 ? "" : "es"
                                }`
                              : ""}
                          </p>
                          {progress.label ? (
                            <div className="episode-progress">
                              <span>{progress.label}</span>
                              <div aria-hidden="true">
                                <i style={{ width: `${progress.percent}%` }} />
                              </div>
                            </div>
                          ) : null}
                        </div>
                        {asset ? (
                          <div className="episode-actions">
                            <a
                              className="secondary-action"
                              href={`/watch/${asset.id}${
                                progress.item?.completed ? "?start=1" : ""
                              }`}
                            >
                              {progress.item?.completed
                                ? "Reassistir"
                                : progress.item
                                  ? "Continuar"
                                  : "Assistir"}
                            </a>
                            {progress.item && !progress.item.completed ? (
                              <a className="text-action" href={`/watch/${asset.id}?start=1`}>
                                Do inicio
                              </a>
                            ) : null}
                          </div>
                        ) : (
                          <span className="episode-unavailable">Indisponivel</span>
                        )}
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </section>
      ) : null}

      <div className="title-detail-content">
        <Carousel title="Titulos similares">
          {data.similar.map((item) => (
            <TitleCard
              inWatchlist={data.watchlist.some((watchlistItem) => watchlistItem.titleId === item.id)}
              key={item.id}
              profileId={profileId}
              title={item}
            />
          ))}
        </Carousel>
      </div>
    </main>
  );
}
