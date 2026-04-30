export default function HomePage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24
      }}
    >
      <section style={{ width: "min(960px, 100%)" }}>
        <p style={{ margin: 0, color: "var(--accent)", fontWeight: 700 }}>
          Movth
        </p>
        <h1 style={{ margin: "12px 0", fontSize: 48, lineHeight: 1.05 }}>
          Fundação da plataforma de streaming
        </h1>
        <p style={{ margin: 0, maxWidth: 620, color: "var(--muted)", fontSize: 18 }}>
          Next.js 14 conectado à base do monorepo. As próximas fases entram em
          autenticação, catálogo, reprodução HLS, billing e backoffice.
        </p>
      </section>
    </main>
  );
}
