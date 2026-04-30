"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function logout() {
    setLoading(true);
    await fetch("/api/auth/logout", {
      method: "POST"
    });
    router.push("/login" as Route);
    router.refresh();
  }

  return (
    <button className="text-action" disabled={loading} onClick={() => void logout()} type="button">
      {loading ? "Saindo..." : "Sair"}
    </button>
  );
}
