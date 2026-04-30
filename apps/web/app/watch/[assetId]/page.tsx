import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LogoutButton } from "../../components/LogoutButton";
import { PROFILE_COOKIE, requireUser, serverApi } from "../../lib/session";

type WatchPageProps = {
  params: {
    assetId: string;
  };
};

type WatchResponse = {
  assetId: string;
  titleId: string;
  episodeId: string | null;
  quality: string;
  manifestUrl: string;
  expiresAt: string;
  sessionId: string;
};

export default async function WatchPage({ params }: WatchPageProps) {
  await requireUser();

  if (!cookies().get(PROFILE_COOKIE)?.value) {
    redirect("/profiles");
  }

  const watch = await serverApi<WatchResponse>(`/watch/${params.assetId}`);

  if (!watch.ok || !watch.body.data) {
    return (
      <main className="watch-page">
        <nav className="top-nav">
          <p className="brand-mark">Movth</p>
          <LogoutButton />
        </nav>
        <section className="watch-placeholder">
          <p className="eyebrow">Player</p>
          <h1>Nao foi possivel iniciar este video.</h1>
          <p>{watch.body.error?.message ?? "Tente outro titulo."}</p>
        </section>
      </main>
    );
  }

  return (
    <main className="watch-page">
      <nav className="top-nav">
        <p className="brand-mark">Movth</p>
        <LogoutButton />
      </nav>
      <section className="watch-placeholder">
        <p className="eyebrow">Player HLS</p>
        <h1>Stream autorizado.</h1>
        <p>Manifesto: {watch.body.data.manifestUrl}</p>
        <p>Qualidade: {watch.body.data.quality}</p>
      </section>
    </main>
  );
}
