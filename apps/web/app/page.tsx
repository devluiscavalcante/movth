import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LogoutButton } from "./components/LogoutButton";
import { PROFILE_COOKIE, requireUser } from "./lib/session";

export default async function HomePage() {
  const user = await requireUser();
  const profileId = cookies().get(PROFILE_COOKIE)?.value;

  if (!profileId) {
    redirect("/profiles");
  }

  return (
    <main className="home-page">
      <nav className="top-nav">
        <p className="brand-mark">Movth</p>
        <LogoutButton />
      </nav>
      <section className="home-hero">
        <p className="eyebrow">Conta ativa</p>
        <h1>Catalogo e player entram na proxima etapa.</h1>
        <p>
          Usuario: {user.email}. Perfil selecionado: {profileId}.
        </p>
      </section>
    </main>
  );
}
