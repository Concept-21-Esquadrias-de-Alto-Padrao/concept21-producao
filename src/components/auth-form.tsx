"use client";

import { FloatingMessage } from "@/components/floating-feedback";

import { ArrowLeft, LogIn, UserPlus } from "lucide-react";
import Link from "next/link";
import { type FormEvent, useState } from "react";
import { hasSupabaseBrowserEnv } from "@/lib/supabase/client";
import { signInWithEmail, signUpWithEmail } from "@/lib/auth-client";
import { toUserFriendlyErrorMessage } from "@/lib/errors";
import { inputClass } from "./action-form";

type AuthMode = "login" | "signup";

export function AuthForm({ mode, notice }: { mode: AuthMode; notice?: string }) {
  const isSignup = mode === "signup";
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    setSuccess(false);

    try {
      if (!hasSupabaseBrowserEnv()) {
        throw new Error("Configure NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY.");
      }

      if (isSignup) {
        if (!fullName.trim() || !email.trim() || !password) {
          throw new Error("Nome completo, e-mail e senha são obrigatórios.");
        }

        if (password.length < 6) {
          throw new Error("A senha deve ter pelo menos 6 caracteres.");
        }

        if (password !== confirmPassword) {
          throw new Error("A confirmação de senha não confere.");
        }
      }

      if (isSignup) {
        const data = await signUpWithEmail({
          fullName,
          email: email.trim(),
          phone,
          password,
        });

        if (data.session) {
          window.location.href = "/";
          return;
        }

        setSuccess(true);
        setMessage(
          "Cadastro criado. Verifique seu e-mail para confirmar o acesso e depois entre na plataforma.",
        );
        setPassword("");
        setConfirmPassword("");
        return;
      }

      await signInWithEmail(email, password);

      window.location.href = "/";
    } catch (error) {
      setSuccess(false);
      setMessage(toUserFriendlyErrorMessage(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-charcoal px-4 py-10">
      <section className="w-full max-w-md rounded-md border border-white/10 bg-white p-6 shadow-2xl">
        <div className="mb-6">
          {isSignup ? (
            <Link
              href="/login"
              className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-zinc-500 transition hover:text-accent"
            >
              <ArrowLeft className="size-4" />
              Voltar ao login
            </Link>
          ) : null}

          <div className="mb-4 grid size-12 place-items-center rounded-md bg-accent font-semibold text-accent-foreground">
            C21
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
            Concept21 Aluminium
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-zinc-950">
            {isSignup ? "Criar cadastro" : "Acesso à Produção"}
          </h1>
          <p className="mt-2 text-sm leading-6 text-zinc-500">
            {isSignup
              ? "Crie seu login. O nível de acesso será liberado pelo Administrador após o vínculo do perfil."
              : "Autenticação via Supabase Auth. As permissões são aplicadas pelo RBAC do banco."}
          </p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <FloatingMessage message={!message ? notice : null} kind="success" />

          <FloatingMessage message={message} kind={success ? "success" : "error"} />

          {isSignup ? (
            <label className="block space-y-1.5">
              <span className="text-sm font-semibold text-charcoal">Nome completo</span>
              <input
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                className={inputClass}
                autoComplete="name"
                required
              />
            </label>
          ) : null}

          <label className="block space-y-1.5">
            <span className="text-sm font-semibold text-charcoal">E-mail</span>
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              className={inputClass}
              autoComplete="email"
              required
            />
          </label>

          {isSignup ? (
            <label className="block space-y-1.5">
              <span className="text-sm font-semibold text-charcoal">Telefone</span>
              <input
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                className={inputClass}
                autoComplete="tel"
              />
            </label>
          ) : null}

          <label className="block space-y-1.5">
            <span className="text-sm font-semibold text-charcoal">Senha</span>
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              className={inputClass}
              placeholder={isSignup ? "Mínimo de 6 caracteres" : "Sua senha"}
              autoComplete={isSignup ? "new-password" : "current-password"}
              required
            />
          </label>

          {isSignup ? (
            <label className="block space-y-1.5">
              <span className="text-sm font-semibold text-charcoal">Confirmar senha</span>
              <input
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                type="password"
                className={inputClass}
                autoComplete="new-password"
                required
              />
            </label>
          ) : null}

          <button
            type="submit"
            disabled={pending}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSignup ? <UserPlus className="size-4" /> : <LogIn className="size-4" />}
            {pending
              ? isSignup
                ? "Criando cadastro..."
                : "Entrando..."
              : isSignup
                ? "Criar cadastro"
                : "Entrar"}
          </button>
        </form>

        {!isSignup ? (
          <div className="mt-5 border-t border-zinc-200 pt-4 text-center text-sm text-zinc-600">
            Ainda não tem cadastro?{" "}
            <Link href="/cadastro" className="font-semibold text-accent hover:text-orange-600">
              Criar acesso
            </Link>
          </div>
        ) : null}
      </section>
    </main>
  );
}
