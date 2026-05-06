"use client";

type EmbedPlayerProps = {
  embedUrl: string;
  titleLabel: string;
  subtitle: string;
  backHref: string;
  nextHref: string | null;
  nextLabel: string | null;
};

export function EmbedPlayer({
  embedUrl,
  titleLabel,
  subtitle,
  backHref,
  nextHref,
  nextLabel
}: EmbedPlayerProps) {
  return (
    <section className="embed-player-shell">
      <div className="player-title-overlay embed-player-overlay">
        <a href={backHref}>Voltar</a>
        <div>
          <strong>{titleLabel}</strong>
          <span>{subtitle}</span>
        </div>
      </div>
      <iframe
        allow="autoplay; fullscreen; picture-in-picture"
        allowFullScreen
        loading="eager"
        referrerPolicy="no-referrer"
        src={embedUrl}
        title={`Player - ${titleLabel}`}
      />
      {nextHref ? (
        <div className="embed-next-action">
          <a className="secondary-action" href={nextHref}>
            Proximo {nextLabel}
          </a>
        </div>
      ) : null}
    </section>
  );
}
