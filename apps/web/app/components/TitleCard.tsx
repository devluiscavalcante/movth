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

function shortSynopsis(value: string) {
  return value.length > 116 ? `${value.slice(0, 113).trim()}...` : value;
}

function readyAssets(title: Title) {
  return title.assets?.filter((asset) => asset.status === "READY") ?? [];
}

function sourceLabel(title: Title) {
  const assets = readyAssets(title);

  if (assets.some((asset) => asset.source === "HLS")) {
    return "Movth";
  }

  if (assets.some((asset) => asset.source === "EMBED")) {
    return "Fonte externa";
  }

  return "Em breve";
}

export function TitleCard({ title, profileId, inWatchlist = false, progressLabel }: TitleCardProps) {
  const imageUrl = imageForTitle(title);
  const hasPlayableAsset = readyAssets(title).length > 0;
  const primaryGenre = title.genres[0]?.name;
  const availabilityLabel = hasPlayableAsset ? "Disponivel" : "Em breve";

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
        <div className="poster-badges">
          <span>{title.type === "MOVIE" ? "Filme" : "Serie"}</span>
          <span>{availabilityLabel}</span>
          {hasPlayableAsset ? <span>{sourceLabel(title)}</span> : null}
        </div>
        <div className="poster-actions">
          {hasPlayableAsset ? (
            <a aria-label={`Assistir ${title.title}`} className="play-action" href={`/play/title/${title.id}`}>
              {"\u25b6"}
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
          {title.releaseYear} - {title.rating}
          {primaryGenre ? ` - ${primaryGenre}` : ""}
        </p>
        <p className="title-card-synopsis">{shortSynopsis(title.synopsis)}</p>
        {progressLabel ? <span className="progress-label">{progressLabel}</span> : null}
      </div>
    </article>
  );
}
