"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

type Mode = "login" | "signup";

type AuthFormProps = {
  mode: Mode;
};

function endpointForMode(mode: Mode) {
  return mode === "login" ? "/api/auth/login" : "/api/auth/register";
}

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const response = await fetch(endpointForMode(mode), {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({ email, password })
    });
    const body = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
    };

    setLoading(false);

    if (!response.ok) {
      setError(body.error?.message ?? "Nao foi possivel autenticar.");
      return;
    }

    router.push("/profiles" as Route);
    router.refresh();
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      <label>
        Email
        <input
          autoComplete="email"
          inputMode="email"
          name="email"
          onChange={(event) => setEmail(event.target.value)}
          placeholder="voce@exemplo.com"
          required
          type="email"
          value={email}
        />
      </label>
      <label>
        Senha
        <input
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          minLength={8}
          name="password"
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Minimo de 8 caracteres"
          required
          type="password"
          value={password}
        />
      </label>
      {mode === "signup" ? (
        <div className="plan-summary" aria-label="Plano inicial">
          <strong>Basic</strong>
          <span>Periodo de teste ativo. Upgrade via assinatura entra na area da conta.</span>
        </div>
      ) : null}
      {error ? <p className="form-error">{error}</p> : null}
      <button className="primary-action" disabled={loading} type="submit">
        {loading ? "Processando..." : mode === "login" ? "Entrar" : "Criar conta"}
      </button>
    </form>
  );
}
