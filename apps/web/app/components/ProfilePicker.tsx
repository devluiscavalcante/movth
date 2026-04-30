"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import type { Profile } from "../lib/session";

type ProfilePickerProps = {
  initialProfiles: Profile[];
};

export function ProfilePicker({ initialProfiles }: ProfilePickerProps) {
  const router = useRouter();
  const [profiles, setProfiles] = useState(initialProfiles);
  const [name, setName] = useState("");
  const [isKids, setIsKids] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function selectProfile(profileId: string) {
    setError(null);

    const response = await fetch("/api/profiles/select", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({ profileId })
    });

    if (!response.ok) {
      setError("Nao foi possivel selecionar o perfil.");
      return;
    }

    router.push("/");
    router.refresh();
  }

  async function createProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setCreating(true);

    const response = await fetch("/api/profiles", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({ name, isKids })
    });
    const body = (await response.json().catch(() => ({}))) as {
      data?: Profile;
      error?: { message?: string };
    };

    setCreating(false);

    if (!response.ok || !body.data) {
      setError(body.error?.message ?? "Nao foi possivel criar o perfil.");
      return;
    }

    setProfiles((current) => [...current, body.data as Profile]);
    setName("");
    setIsKids(false);
  }

  return (
    <div className="profiles-shell">
      <div className="profiles-grid">
        {profiles.map((profile) => (
          <button
            className="profile-tile"
            key={profile.id}
            onClick={() => void selectProfile(profile.id)}
            type="button"
          >
            <span className="profile-avatar">
              {profile.avatarUrl ? (
                <Image
                  alt=""
                  height={240}
                  src={profile.avatarUrl}
                  unoptimized
                  width={240}
                />
              ) : (
                profile.name.slice(0, 1).toUpperCase()
              )}
            </span>
            <span className="profile-name">{profile.name}</span>
            <span className="profile-meta">
              {profile.isKids ? "Kids" : "Padrao"}
              {profile.hasPin ? " · PIN" : ""}
            </span>
          </button>
        ))}
      </div>

      <form className="create-profile" onSubmit={createProfile}>
        <h2>Novo perfil</h2>
        <label>
          Nome
          <input
            maxLength={40}
            onChange={(event) => setName(event.target.value)}
            placeholder="Nome do perfil"
            required
            value={name}
          />
        </label>
        <label className="checkbox-row">
          <input
            checked={isKids}
            onChange={(event) => setIsKids(event.target.checked)}
            type="checkbox"
          />
          Perfil infantil
        </label>
        {error ? <p className="form-error">{error}</p> : null}
        <button className="secondary-action" disabled={creating} type="submit">
          {creating ? "Criando..." : "Adicionar perfil"}
        </button>
      </form>
    </div>
  );
}
