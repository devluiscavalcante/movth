import Image from "next/image";
import type { Title } from "../lib/session";
import { WatchlistButton } from "./WatchlistButton";

type TitleCardProps = {
  title: Title;
  profileId: string;
  inWatchlist?: boolean;
  progressLabel?: string;
};

function imageForTitle(title: Title) {
  return title.posterUrl ?? title.backdropUrl;
}

export function TitleCard({ title, profileId, inWatchlist = false, progressLabel }: TitleCardProps) {
  const imageUrl = imageForTitle(title);
  const playableAsset = title.assets?.find((asset) => asset.status === "READY") ?? title.assets?.[0];

  return (
    <article className="title-card">
      <div className="poster-frame">
        <a className="poster-link" href={`/title/${title.id}`}>
          {imageUrl ? (
            <Image alt="" fill sizes="220px" src={imageUrl} unoptimized />
          ) : (
            <span>{title.title.slice(0, 1).toUpperCase()}</span>
          )}
        </a>
        <div className="poster-actions">
          {playableAsset ? (
            <a className="play-action" href={`/watch/${playableAsset.id}`}>
              ▶
            </a>
          ) : null}
          <WatchlistButton
            compact
            initialInWatchlist={inWatchlist}
            profileId={profileId}
            titleId={title.id}
          />
        </div>
      </div>
      <div className="title-card-copy">
        <h3>{title.title}</h3>
        <p>
          {title.releaseYear} · {title.rating} · {title.type === "MOVIE" ? "Filme" : "Serie"}
        </p>
        {progressLabel ? <span className="progress-label">{progressLabel}</span> : null}
      </div>
    </article>
  );
}
