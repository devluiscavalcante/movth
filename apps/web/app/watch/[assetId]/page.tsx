import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { HlsPlayer } from "../../components/HlsPlayer";
import { LogoutButton } from "../../components/LogoutButton";
import {
  PROFILE_COOKIE,
  type WatchHistoryItem,
  type WatchResponse,
  requireUser,
  serverApi
} from "../../lib/session";

type WatchPageProps = {
  params: {
    assetId: string;
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

export default async function WatchPage({ params }: WatchPageProps) {
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

  const initialPositionS = await getInitialPosition(profileId, watch.body.data);

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
        nextHref={
          watch.body.data.nextEpisode ? `/watch/${watch.body.data.nextEpisode.assetId}` : null
        }
        nextLabel={
          watch.body.data.nextEpisode
            ? `T${watch.body.data.nextEpisode.season}:E${watch.body.data.nextEpisode.number}`
            : null
        }
        profileId={profileId}
        subtitle={
          watch.body.data.episode
            ? `T${watch.body.data.episode.season}:E${watch.body.data.episode.number}`
            : `${watch.body.data.title.releaseYear} - ${watch.body.data.title.rating}`
        }
        titleLabel={watch.body.data.title.title}
        titleId={watch.body.data.titleId}
      />
    </main>
  );
}
