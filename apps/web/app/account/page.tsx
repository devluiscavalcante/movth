import { cookies } from "next/headers";
import { LogoutButton } from "../components/LogoutButton";
import { PortalButton } from "../components/PortalButton";
import { PROFILE_COOKIE, type Profile, requireUser, serverApi } from "../lib/session";

function formatDate(value: string | null) {
  if (!value) {
    return "Nao informado";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium"
  }).format(new Date(value));
}

export default async function AccountPage() {
  const user = await requireUser();
  const profiles = await serverApi<Profile[]>("/profiles");
  const selectedProfileId = cookies().get(PROFILE_COOKIE)?.value;
  const profileList = profiles.body.data ?? [];
  const selectedProfile = profileList.find((profile) => profile.id === selectedProfileId);

  return (
    <main className="account-page">
      <nav className="top-nav account-nav">
        <a className="brand-mark" href="/">
          Movth
        </a>
        <div className="nav-actions">
          {user.role === "ADMIN" ? <a href="/admin">Admin</a> : null}
          <a href="/search">Busca</a>
          <a href="/profiles">Perfis</a>
          <LogoutButton />
        </div>
      </nav>

      <section className="account-header">
        <p className="eyebrow">Conta</p>
        <h1>{user.email}</h1>
        <p>Gerencie plano, perfis e dados basicos da assinatura.</p>
      </section>

      <section className="account-grid">
        <article className="account-panel plan-panel">
          <div>
            <p className="panel-label">Plano atual</p>
            <h2>{user.plan?.name ?? "Sem plano"}</h2>
          </div>
          {user.plan ? (
            <dl className="plan-facts">
              <div>
                <dt>Perfis</dt>
                <dd>{user.plan.maxProfiles}</dd>
              </div>
              <div>
                <dt>Telas simultaneas</dt>
                <dd>{user.plan.maxStreams}</dd>
              </div>
              <div>
                <dt>4K</dt>
                <dd>{user.plan.has4k ? "Incluido" : "Nao incluido"}</dd>
              </div>
            </dl>
          ) : null}
          <PortalButton />
        </article>

        <article className="account-panel">
          <p className="panel-label">Sessao</p>
          <dl className="account-facts">
            <div>
              <dt>Perfil ativo</dt>
              <dd>{selectedProfile?.name ?? "Nenhum perfil selecionado"}</dd>
            </div>
            <div>
              <dt>Trial ate</dt>
              <dd>{formatDate(user.trialEndsAt)}</dd>
            </div>
            <div>
              <dt>Tipo de conta</dt>
              <dd>{user.role ?? "USER"}</dd>
            </div>
          </dl>
        </article>

        <article className="account-panel profiles-panel">
          <div className="panel-heading-row">
            <div>
              <p className="panel-label">Perfis</p>
              <h2>{profileList.length} cadastrado{profileList.length === 1 ? "" : "s"}</h2>
            </div>
            <a className="secondary-action" href="/profiles">
              Editar
            </a>
          </div>
          <div className="account-profile-list">
            {profileList.map((profile) => (
              <div className="account-profile-row" key={profile.id}>
                <span className="small-avatar">{profile.name.slice(0, 1).toUpperCase()}</span>
                <div>
                  <strong>{profile.name}</strong>
                  <p>
                    {profile.isKids ? "Kids" : "Padrao"}
                    {profile.hasPin ? " · PIN" : ""}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>
    </main>
  );
}
