"use client";

import Hls from "hls.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type HlsPlayerProps = {
  manifestUrl: string;
  profileId: string;
  titleId: string;
  episodeId: string | null;
  initialPositionS: number;
  titleLabel: string;
  subtitle: string;
  backHref: string;
  nextHref: string | null;
  nextLabel: string | null;
};

type QualityLevel = {
  index: number;
  label: string;
};

function formatTime(value: number) {
  if (!Number.isFinite(value)) {
    return "0:00";
  }

  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60)
    .toString()
    .padStart(2, "0");

  return `${minutes}:${seconds}`;
}

function levelLabel(level: { height?: number; bitrate?: number }) {
  if (level.height) {
    return `${level.height}p`;
  }

  if (level.bitrate) {
    return `${Math.round(level.bitrate / 1000)}kbps`;
  }

  return "Auto";
}

export function HlsPlayer({
  manifestUrl,
  profileId,
  titleId,
  episodeId,
  initialPositionS,
  titleLabel,
  subtitle,
  backHref,
  nextHref,
  nextLabel
}: HlsPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const lastSavedRef = useRef(0);
  const completedSavedRef = useRef(false);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(initialPositionS);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [levels, setLevels] = useState<QualityLevel[]>([]);
  const [selectedLevel, setSelectedLevel] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const [ended, setEnded] = useState(false);
  const [buffering, setBuffering] = useState(true);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [nextCountdown, setNextCountdown] = useState(10);

  const progress = useMemo(() => {
    if (!duration) {
      return 0;
    }

    return Math.min(100, Math.max(0, (currentTime / duration) * 100));
  }, [currentTime, duration]);

  const saveProgress = useCallback(async (positionS: number, completed = false) => {
    await fetch("/api/history", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        profileId,
        titleId,
        ...(episodeId ? { episodeId } : {}),
        positionS: Math.max(0, Math.floor(positionS)),
        completed
      })
    }).catch(() => undefined);
  }, [episodeId, profileId, titleId]);

  useEffect(() => {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    setError(null);
    setBuffering(true);
    setLevels([]);
    setSelectedLevel(-1);

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = manifestUrl;
    } else if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false
      });

      hlsRef.current = hls;
      hls.loadSource(manifestUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
        setBuffering(false);
        setLevels(
          data.levels.map((level, index) => ({
            index,
            label: levelLabel(level)
          }))
        );
      });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          setError("Nao foi possivel carregar o stream HLS.");
          setBuffering(false);
        }
      });
    } else {
      setError("Este navegador nao suporta reproducao HLS.");
      setBuffering(false);
    }

    return () => {
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, [manifestUrl]);

  useEffect(() => {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    video.volume = volume;
    video.muted = muted;
  }, [muted, volume]);

  useEffect(() => {
    if (!ended || !nextHref) {
      return;
    }

    setNextCountdown(10);
    const intervalId = window.setInterval(() => {
      setNextCountdown((current) => {
        if (current <= 1) {
          window.location.href = nextHref;
          window.clearInterval(intervalId);
          return 0;
        }

        return current - 1;
      });
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [ended, nextHref]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;

      if (target?.tagName === "INPUT" || target?.tagName === "SELECT") {
        return;
      }

      if (event.key === " ") {
        event.preventDefault();
        void togglePlay();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        seekBy(10);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        seekBy(-10);
      } else if (event.key.toLowerCase() === "m") {
        event.preventDefault();
        setMuted((current) => !current);
      } else if (event.key.toLowerCase() === "f") {
        event.preventDefault();
        void enterFullscreen();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  useEffect(() => {
    function saveBeforeExit() {
      const video = videoRef.current;

      if (video && video.currentTime > 0 && !ended) {
        void saveProgress(video.currentTime);
      }
    }

    window.addEventListener("pagehide", saveBeforeExit);

    return () => window.removeEventListener("pagehide", saveBeforeExit);
  }, [ended, saveProgress]);

  async function togglePlay() {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    if (video.paused) {
      await video.play().catch(() => undefined);
    } else {
      video.pause();
    }
  }

  function seekTo(value: number) {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    const nextValue = Math.min(Math.max(value, 0), duration || value);
    video.currentTime = nextValue;
    setCurrentTime(nextValue);
  }

  function seekBy(delta: number) {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    seekTo(video.currentTime + delta);
  }

  function changeLevel(value: number) {
    setSelectedLevel(value);

    if (hlsRef.current) {
      hlsRef.current.currentLevel = value;
    }
  }

  async function enterFullscreen() {
    const container = videoRef.current?.parentElement;
    await container?.requestFullscreen?.().catch(() => undefined);
  }

  function revealControls() {
    setControlsVisible(true);

    if (controlsTimerRef.current) {
      clearTimeout(controlsTimerRef.current);
    }

    if (playing) {
      controlsTimerRef.current = setTimeout(() => setControlsVisible(false), 2600);
    }
  }

  function retryStream() {
    setError(null);
    setBuffering(true);
    hlsRef.current?.destroy();
    hlsRef.current = null;

    const video = videoRef.current;

    if (video) {
      video.load();
    }

    window.location.reload();
  }

  return (
    <section
      className={controlsVisible || !playing ? "player-shell" : "player-shell is-chrome-hidden"}
      onMouseMove={revealControls}
    >
      <div className="video-stage">
        <div className="player-title-overlay">
          <a href={backHref}>Voltar</a>
          <div>
            <strong>{titleLabel}</strong>
            <span>{subtitle}</span>
          </div>
        </div>
        <video
          autoPlay
          onClick={() => void togglePlay()}
          onDurationChange={(event) => setDuration(event.currentTarget.duration)}
          onEnded={(event) => {
            setPlaying(false);
            setEnded(true);
            setControlsVisible(true);
            void saveProgress(event.currentTarget.duration, true);
          }}
          onLoadedMetadata={(event) => {
            const safeInitialPosition =
              event.currentTarget.duration > 0 && initialPositionS / event.currentTarget.duration < 0.95
                ? initialPositionS
                : 0;

            if (safeInitialPosition > 0 && event.currentTarget.duration > safeInitialPosition) {
              event.currentTarget.currentTime = safeInitialPosition;
            }
          }}
          onPause={(event) => {
            setPlaying(false);
            setControlsVisible(true);
            if (!ended && event.currentTarget.currentTime > 0) {
              void saveProgress(event.currentTarget.currentTime);
            }
          }}
          onPlay={() => {
            setPlaying(true);
            setEnded(false);
            revealControls();
          }}
          onStalled={() => setBuffering(true)}
          onWaiting={() => setBuffering(true)}
          onCanPlay={() => setBuffering(false)}
          onPlaying={() => setBuffering(false)}
          onTimeUpdate={(event) => {
            const nextTime = event.currentTarget.currentTime;
            setCurrentTime(nextTime);

            if (nextTime - lastSavedRef.current >= 10) {
              lastSavedRef.current = nextTime;
              const completed = duration > 0 && nextTime / duration >= 0.95;

              if (completed) {
                completedSavedRef.current = true;
              }

              void saveProgress(nextTime, completed);
            } else if (!completedSavedRef.current && duration > 0 && nextTime / duration >= 0.95) {
              completedSavedRef.current = true;
              void saveProgress(nextTime, true);
            }
          }}
          playsInline
          ref={videoRef}
        />
        {buffering && !error ? <p className="player-loading">Carregando...</p> : null}
        {error ? (
          <div className="player-error">
            <p>{error}</p>
            <button className="secondary-action" onClick={retryStream} type="button">
              Tentar novamente
            </button>
          </div>
        ) : null}
        {ended && nextHref ? (
          <div className="next-episode-overlay">
            <p>Proximo episodio</p>
            <a className="primary-action" href={nextHref}>
              Assistir {nextLabel}
            </a>
            <span>Iniciando em {nextCountdown}s</span>
          </div>
        ) : null}
      </div>

      <div className="player-controls">
        <button className="control-button" onClick={() => void togglePlay()} type="button">
          {playing ? "Pause" : "Play"}
        </button>
        <div className="time-control">
          <span>{formatTime(currentTime)}</span>
          <input
            aria-label="Progresso"
            max={duration || 0}
            min={0}
            onChange={(event) => seekTo(Number(event.target.value))}
            step={1}
            type="range"
            value={Math.min(currentTime, duration || currentTime)}
          />
          <span>{formatTime(duration)}</span>
        </div>
        <div className="volume-control">
          <button className="control-button" onClick={() => setMuted((current) => !current)} type="button">
            {muted ? "Mudo" : "Som"}
          </button>
          <input
            aria-label="Volume"
            max={1}
            min={0}
            onChange={(event) => setVolume(Number(event.target.value))}
            step={0.05}
            type="range"
            value={volume}
          />
        </div>
        <select
          aria-label="Qualidade"
          onChange={(event) => changeLevel(Number(event.target.value))}
          value={selectedLevel}
        >
          <option value={-1}>Auto</option>
          {levels.map((level) => (
            <option key={level.index} value={level.index}>
              {level.label}
            </option>
          ))}
        </select>
        <button className="control-button" onClick={() => void enterFullscreen()} type="button">
          Fullscreen
        </button>
      </div>
      <div className="progress-meter" aria-hidden="true">
        <span style={{ width: `${progress}%` }} />
      </div>
    </section>
  );
}
