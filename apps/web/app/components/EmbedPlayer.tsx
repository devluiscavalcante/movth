"use client";

import { useEffect, useRef, useState } from "react";

type EmbedPlayerProps = {
  embedUrl: string;
  profileId: string;
  titleId: string;
  episodeId: string | null;
  titleLabel: string;
  subtitle: string;
  backHref: string;
  nextHref: string | null;
  nextLabel: string | null;
  seasons: ExternalPlayerSeason[];
};

export type ExternalPlayerEpisode = {
  id: string;
  season: number;
  number: number;
  durationS: number;
  href: string | null;
  isCurrent: boolean;
};

export type ExternalPlayerSeason = {
  season: number;
  episodes: ExternalPlayerEpisode[];
};

function formatDuration(seconds: number) {
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `${minutes} min`;
}

export function EmbedPlayer({
  embedUrl,
  profileId,
  titleId,
  episodeId,
  titleLabel,
  subtitle,
  backHref,
  nextHref,
  nextLabel,
  seasons
}: EmbedPlayerProps) {
  const shellRef = useRef<HTMLElement | null>(null);
  const [frameVisible, setFrameVisible] = useState(false);
  const [slowLoad, setSlowLoad] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [episodesOpen, setEpisodesOpen] = useState(false);

  useEffect(() => {
    void fetch("/api/history", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        profileId,
        titleId,
        ...(episodeId ? { episodeId } : {}),
        positionS: 1,
        completed: false
      })
    }).catch(() => undefined);
  }, [episodeId, profileId, titleId]);

  useEffect(() => {
    setFrameVisible(false);
    setSlowLoad(false);
    const fallbackTimer = window.setTimeout(() => setFrameVisible(true), 1800);
    const slowLoadTimer = window.setTimeout(() => setSlowLoad(true), 5200);

    return () => {
      window.clearTimeout(fallbackTimer);
      window.clearTimeout(slowLoadTimer);
    };
  }, [embedUrl, reloadKey]);

  function reloadPlayer() {
    setFrameVisible(false);
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
      {!frameVisible ? (
        <div className="embed-loading-panel" aria-live="polite">
          <span className="embed-loading-mark" aria-hidden="true" />
          <p>Carregando player externo</p>
          <button className="secondary-action" onClick={() => setFrameVisible(true)} type="button">
            Mostrar player
          </button>
        </div>
      ) : null}
      <iframe
        allow="autoplay; fullscreen; picture-in-picture"
        allowFullScreen
        className={frameVisible ? "is-loaded" : ""}
        key={reloadKey}
        loading="eager"
        onLoad={() => setFrameVisible(true)}
        referrerPolicy="no-referrer"
        src={embedUrl}
        title={`Player - ${titleLabel}`}
      />
      {slowLoad ? (
        <div className="embed-fallback-panel" aria-live="polite">
          <strong>Player externo sem resposta</strong>
          <p>O provedor pode bloquear iframe, demorar para carregar ou exigir abertura direta.</p>
          <div>
            <button className="secondary-action" onClick={reloadPlayer} type="button">
              Recarregar
            </button>
            <a className="secondary-action" href={embedUrl} rel="noreferrer" target="_blank">
              Abrir fonte
            </a>
          </div>
        </div>
      ) : null}
      <div className="embed-player-controls">
        <span>Fonte externa</span>
        <a className="secondary-action" href={embedUrl} rel="noreferrer" target="_blank">
          Abrir fonte
        </a>
        <button className="secondary-action" onClick={reloadPlayer} type="button">
          Recarregar
        </button>
        <button className="secondary-action" onClick={() => void enterFullscreen()} type="button">
          Tela cheia
        </button>
        {seasons.length > 0 ? (
          <button
            className="secondary-action"
            onClick={() => setEpisodesOpen((current) => !current)}
            type="button"
          >
            Episodios
          </button>
        ) : null}
        {nextHref ? (
          <a className="secondary-action" href={nextHref}>
            Proximo {nextLabel}
          </a>
        ) : null}
      </div>
      {episodesOpen ? (
        <aside className="embed-episodes-panel" aria-label="Episodios">
          <div className="embed-episodes-header">
            <div>
              <span>Temporadas</span>
              <strong>{titleLabel}</strong>
            </div>
            <button
              aria-label="Fechar episodios"
              className="text-action"
              onClick={() => setEpisodesOpen(false)}
              type="button"
            >
              Fechar
            </button>
          </div>
          <div className="embed-season-list">
            {seasons.map((season) => (
              <section className="embed-season-group" key={season.season}>
                <h2>Temporada {season.season}</h2>
                <div className="embed-episode-list">
                  {season.episodes.map((episode) => (
                    <a
                      aria-current={episode.isCurrent ? "page" : undefined}
                      className={
                        episode.isCurrent
                          ? "embed-episode-link is-current"
                          : "embed-episode-link"
                      }
                      href={episode.href ?? "#"}
                      key={episode.id}
                    >
                      <span>E{episode.number}</span>
                      <div>
                        <strong>Episodio {episode.number}</strong>
                        <small>{formatDuration(episode.durationS)}</small>
                      </div>
                    </a>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </aside>
      ) : null}
    </section>
  );
}
