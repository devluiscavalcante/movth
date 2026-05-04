"use client";

import { useState } from "react";

export function PortalButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openPortal() {
    setLoading(true);
    setError(null);

    const response = await fetch("/api/subscription/portal", {
      method: "POST"
    });
    const body = (await response.json().catch(() => ({}))) as {
      data?: {
        url?: string;
      };
      error?: {
        message?: string;
      };
    };

    setLoading(false);

    if (!response.ok || !body.data?.url) {
      setError(body.error?.message ?? "Nao foi possivel abrir o portal.");
      return;
    }

    window.location.assign(body.data.url);
  }

  return (
    <div className="portal-action">
      <button className="primary-action" disabled={loading} onClick={() => void openPortal()} type="button">
        {loading ? "Abrindo..." : "Gerenciar assinatura"}
      </button>
      {error ? <p className="form-error">{error}</p> : null}
    </div>
  );
}
