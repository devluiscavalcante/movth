export default function NotFoundPage() {
  return (
    <main className="state-page">
      <section className="state-panel">
        <p className="brand-mark">Movth</p>
        <h1>Pagina nao encontrada.</h1>
        <p>O conteudo pode ter sido removido ou o endereco esta incorreto.</p>
        <div className="state-actions">
          <a className="primary-action" href="/">
            Voltar ao inicio
          </a>
          <a className="secondary-action" href="/search">
            Buscar titulos
          </a>
        </div>
      </section>
    </main>
  );
}
