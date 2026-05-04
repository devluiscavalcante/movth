"use client";

import Hls from "hls.js";
import { useEffect, useMemo, useRef, useState } from "react";

type HlsPlayerProps = {
  manifestUrl: string;
  profileId: string;
  titleId: string;
  episodeId: string | null;
  initialPositionS: number;
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
  initialPositionS
}: HlsPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const lastSavedRef = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(initialPositionS);
  const [volume, setVolume] = useState(1);
  const [levels, setLevels] = useState<QualityLevel[]>([]);
  const [selectedLevel, setSelectedLevel] = useState(-1);
  const [error, setError] = useState<string | null>(null);

  const progress = useMemo(() => {
    if (!duration) {
      return 0;
    }

    return Math.min(100, Math.max(0, (currentTime / duration) * 100));
  }, [currentTime, duration]);

  useEffect(() => {
    const video = videoRef.current;

    if (!video) {
      return;
    }

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
        }
      });
    } else {
      setError("Este navegador nao suporta reproducao HLS.");
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
  }, [volume]);

  async function saveProgress(positionS: number, completed = false) {
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
  }

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

    video.currentTime = value;
    setCurrentTime(value);
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

  return (
    <section className="player-shell">
      <div className="video-stage">
        <video
          onDurationChange={(event) => setDuration(event.currentTarget.duration)}
          onEnded={(event) => {
            setPlaying(false);
            void saveProgress(event.currentTarget.duration, true);
          }}
          onLoadedMetadata={(event) => {
            if (initialPositionS > 0 && event.currentTarget.duration > initialPositionS) {
              event.currentTarget.currentTime = initialPositionS;
            }
          }}
          onPause={() => setPlaying(false)}
          onPlay={() => setPlaying(true)}
          onTimeUpdate={(event) => {
            const nextTime = event.currentTarget.currentTime;
            setCurrentTime(nextTime);

            if (nextTime - lastSavedRef.current >= 10) {
              lastSavedRef.current = nextTime;
              void saveProgress(nextTime);
            }
          }}
          playsInline
          ref={videoRef}
        />
        {error ? <p className="player-error">{error}</p> : null}
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
          <span>Volume</span>
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
          Tela cheia
        </button>
      </div>
      <div className="progress-meter" aria-hidden="true">
        <span style={{ width: `${progress}%` }} />
      </div>
    </section>
  );
}
