import Link from "next/link";
import type { Route } from "next";
import { AuthForm } from "../components/AuthForm";
import { redirectIfAuthenticated } from "../lib/session";

export default async function LoginPage() {
  await redirectIfAuthenticated();

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <p className="brand-mark">Movth</p>
        <h1>Entrar</h1>
        <AuthForm mode="login" />
        <p className="auth-switch">
          Ainda nao tem conta? <Link href={"/signup" as Route}>Criar conta</Link>
        </p>
      </section>
    </main>
  );
}
