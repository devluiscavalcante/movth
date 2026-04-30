"use client";

import { useState } from "react";

type WatchlistButtonProps = {
  profileId: string;
  titleId: string;
  initialInWatchlist?: boolean;
  compact?: boolean;
};

export function WatchlistButton({
  profileId,
  titleId,
  initialInWatchlist = false,
  compact = false
}: WatchlistButtonProps) {
  const [inWatchlist, setInWatchlist] = useState(initialInWatchlist);
  const [loading, setLoading] = useState(false);

  async function toggleWatchlist() {
    setLoading(true);
    const requestUrl = inWatchlist
      ? `/api/watchlist/${titleId}?profileId=${profileId}`
      : "/api/watchlist";
    const requestInit: RequestInit = inWatchlist
      ? {
          method: "DELETE"
        }
      : {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({ profileId, titleId })
        };
    const response = await fetch(requestUrl, requestInit);

    setLoading(false);

    if (response.ok) {
      setInWatchlist((current) => !current);
    }
  }

  return (
    <button
      aria-label={inWatchlist ? "Remover da lista" : "Adicionar a lista"}
      className={compact ? "icon-action" : "secondary-action"}
      disabled={loading}
      onClick={() => void toggleWatchlist()}
      type="button"
    >
      {inWatchlist ? "✓" : "+"}
      {!compact ? <span>{inWatchlist ? "Na lista" : "Minha lista"}</span> : null}
    </button>
  );
}
