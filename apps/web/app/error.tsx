"use client";

import { useEffect } from "react";

type ErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="state-page">
      <section className="state-panel">
        <p className="brand-mark">Movth</p>
        <h1>Algo saiu do esperado.</h1>
        <p>Recarregue a tela ou volte para o catalogo.</p>
        <div className="state-actions">
          <button className="primary-action" onClick={reset} type="button">
            Tentar novamente
          </button>
          <a className="secondary-action" href="/">
            Voltar ao inicio
          </a>
        </div>
      </section>
    </main>
  );
}
