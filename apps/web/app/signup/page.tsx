import Link from "next/link";
import type { Route } from "next";
import { AuthForm } from "../components/AuthForm";
import { redirectIfAuthenticated } from "../lib/session";

export default async function SignupPage() {
  await redirectIfAuthenticated();

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <p className="brand-mark">Movth</p>
        <h1>Criar conta</h1>
        <AuthForm mode="signup" />
        <p className="auth-switch">
          Ja tem conta? <Link href={"/login" as Route}>Entrar</Link>
        </p>
      </section>
    </main>
  );
}
