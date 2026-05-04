import { redirect } from "next/navigation";
import { AdminConsole, type AdminTitle } from "./AdminConsole";
import { LogoutButton } from "../components/LogoutButton";
import { type Genre, requireUser, serverApi } from "../lib/session";

export default async function AdminPage() {
  const user = await requireUser();

  if (user.role !== "ADMIN") {
    redirect("/");
  }

  const [titles, genres] = await Promise.all([
    serverApi<AdminTitle[]>("/admin/titles?pageSize=100"),
    serverApi<Genre[]>("/genres")
  ]);

  return (
    <main className="admin-page">
      <nav className="top-nav admin-nav">
        <a className="brand-mark" href="/">
          Movth
        </a>
        <div className="nav-actions">
          <a href="/">Catalogo</a>
          <a href="/account">Conta</a>
          <LogoutButton />
        </div>
      </nav>

      <section className="admin-header">
        <p className="eyebrow">Admin</p>
        <h1>Backoffice de catalogo</h1>
        <p>Controle operacional para cadastro de titulos, episodios e ingestao manual.</p>
      </section>

      <AdminConsole genres={genres.body.data ?? []} initialTitles={titles.body.data ?? []} />
    </main>
  );
}
