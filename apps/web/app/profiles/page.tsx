import { ProfilePicker } from "../components/ProfilePicker";
import type { Profile } from "../lib/session";
import { requireUser, serverApi } from "../lib/session";

export default async function ProfilesPage() {
  const user = await requireUser();
  const profiles = await serverApi<Profile[]>("/profiles");

  if (!profiles.ok || !profiles.body.data) {
    throw new Error("Unable to load profiles");
  }

  return (
    <main className="profiles-page">
      <header className="profiles-header">
        <p className="brand-mark">Movth</p>
        <div>
          <h1>Escolha um perfil</h1>
          <p>{user.email}</p>
        </div>
      </header>
      <ProfilePicker initialProfiles={profiles.body.data} />
    </main>
  );
}
