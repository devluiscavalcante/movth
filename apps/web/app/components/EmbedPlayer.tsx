"use client";

import { useRef, useState } from "react";

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
  const shellRef = useRef<HTMLElement | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  function reloadPlayer() {
    setLoaded(false);
    setReloadKey((current) => current + 1);
  }

  async function enterFullscreen() {
    await shellRef.current?.requestFullscreen?.().catch(() => undefined);
  }

  return (
    <section className="embed-player-shell" ref={shellRef}>
      <div className="player-title-overlay embed-player-overlay">
        <a href={backHref}>Voltar</a>
        <div>
          <strong>{titleLabel}</strong>
          <span>{subtitle}</span>
        </div>
      </div>
      {!loaded ? (
        <div className="embed-loading-panel" aria-live="polite">
          <span className="embed-loading-mark" aria-hidden="true" />
          <p>Carregando player externo</p>
        </div>
      ) : null}
      <iframe
        allow="autoplay; fullscreen; picture-in-picture"
        allowFullScreen
        className={loaded ? "is-loaded" : ""}
        key={reloadKey}
        loading="eager"
        onLoad={() => setLoaded(true)}
        referrerPolicy="no-referrer"
        src={embedUrl}
        title={`Player - ${titleLabel}`}
      />
      <div className="embed-player-controls">
        <span>Fonte externa</span>
        <button className="secondary-action" onClick={reloadPlayer} type="button">
          Recarregar
        </button>
        <button className="secondary-action" onClick={() => void enterFullscreen()} type="button">
          Tela cheia
        </button>
        {nextHref ? (
          <a className="secondary-action" href={nextHref}>
            Proximo {nextLabel}
          </a>
        ) : null}
      </div>
    </section>
  );
}
