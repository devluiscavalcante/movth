import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { EmbedPlayer } from "../../components/EmbedPlayer";
import { HlsPlayer } from "../../components/HlsPlayer";
import { LogoutButton } from "../../components/LogoutButton";
import {
  PROFILE_COOKIE,
  type EpisodesResponse,
  type WatchHistoryItem,
  type WatchResponse,
  requireUser,
  serverApi
} from "../../lib/session";

type WatchPageProps = {
  params: {
    assetId: string;
  };
  searchParams?: {
    start?: string;
  };
};

async function getInitialPosition(profileId: string, watch: WatchResponse) {
  const history = await serverApi<WatchHistoryItem[]>(
    `/history?profileId=${profileId}&pageSize=50`
  );

  const item = history.body.data?.find(
    (entry) => entry.titleId === watch.titleId && entry.episodeId === watch.episodeId
  );

  return item?.positionS ?? 0;
}

function playableEpisodeAsset(episode: EpisodesResponse["seasons"][number]["episodes"][number]) {
  return (
    episode.videoAssets.find((asset) => asset.status === "READY" && asset.source === "EMBED") ??
    episode.videoAssets.find((asset) => asset.status === "READY") ??
    null
  );
}

async function getEmbedSeasons(watch: WatchResponse) {
  if (watch.title.type !== "SERIES") {
    return [];
  }

  const episodes = await serverApi<EpisodesResponse>(`/titles/${watch.titleId}/episodes`);

  return (
    episodes.body.data?.seasons.map((season) => ({
      season: season.season,
      episodes: season.episodes.map((episode) => {
        const asset = playableEpisodeAsset(episode);

        return {
          id: episode.id,
          season: episode.season,
          number: episode.number,
          durationS: episode.durationS,
          href: asset ? `/watch/${asset.id}` : null,
          isCurrent: episode.id === watch.episodeId
        };
      })
    })) ?? []
  );
}

export default async function WatchPage({ params, searchParams }: WatchPageProps) {
  await requireUser();
  const profileId = cookies().get(PROFILE_COOKIE)?.value;

  if (!profileId) {
    redirect("/profiles");
  }

  const watch = await serverApi<WatchResponse>(`/watch/${params.assetId}`);

  if (!watch.ok || !watch.body.data) {
    return (
      <main className="watch-page">
        <nav className="top-nav watch-nav">
          <a className="brand-mark" href="/">
            Movth
          </a>
          <LogoutButton />
        </nav>
        <section className="watch-placeholder">
          <p className="eyebrow">Player</p>
          <h1>Nao foi possivel iniciar este video.</h1>
          <p>{watch.body.error?.message ?? "Tente outro titulo."}</p>
        </section>
      </main>
    );
  }

  const initialPositionS =
    searchParams?.start === "1" ? 0 : await getInitialPosition(profileId, watch.body.data);
  const subtitle = watch.body.data.episode
    ? `T${watch.body.data.episode.season}:E${watch.body.data.episode.number}`
    : `${watch.body.data.title.releaseYear} - ${watch.body.data.title.rating}`;
  const nextHref = watch.body.data.nextEpisode ? `/watch/${watch.body.data.nextEpisode.assetId}` : null;
  const nextLabel = watch.body.data.nextEpisode
    ? `T${watch.body.data.nextEpisode.season}:E${watch.body.data.nextEpisode.number}`
    : null;

  if (watch.body.data.playbackSource === "EMBED") {
    const seasons = await getEmbedSeasons(watch.body.data);

    return (
      <main className="watch-page watch-player-page">
        <nav className="top-nav watch-nav">
          <a className="brand-mark" href="/">
            Movth
          </a>
          <LogoutButton />
        </nav>
        <EmbedPlayer
          backHref={`/title/${watch.body.data.titleId}`}
          embedUrl={watch.body.data.manifestUrl}
          episodeId={watch.body.data.episodeId}
          nextHref={nextHref}
          nextLabel={nextLabel}
          profileId={profileId}
          seasons={seasons}
          subtitle={subtitle}
          titleLabel={watch.body.data.title.title}
          titleId={watch.body.data.titleId}
        />
      </main>
    );
  }

  return (
    <main className="watch-page watch-player-page">
      <nav className="top-nav watch-nav">
        <a className="brand-mark" href="/">
          Movth
        </a>
        <LogoutButton />
      </nav>
      <HlsPlayer
        backHref={`/title/${watch.body.data.titleId}`}
        episodeId={watch.body.data.episodeId}
        initialPositionS={initialPositionS}
        manifestUrl={watch.body.data.manifestUrl}
        nextHref={nextHref}
        nextLabel={nextLabel}
        profileId={profileId}
        subtitle={subtitle}
        titleLabel={watch.body.data.title.title}
        titleId={watch.body.data.titleId}
      />
    </main>
  );
}
