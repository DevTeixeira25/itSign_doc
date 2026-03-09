"use client";

import { useState } from "react";
import { useAuth } from "../../lib/auth-context";
import { useRouter } from "next/navigation";
import Link from "next/link";

function firebaseErrorMessage(code: string): string {
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "E-mail ou senha incorretos";
    case "auth/too-many-requests":
      return "Muitas tentativas. Tente novamente mais tarde.";
    case "auth/user-disabled":
      return "Conta desativada";
    case "auth/invalid-email":
      return "E-mail inválido";
    case "auth/popup-closed-by-user":
      return ""; // user cancelled
    default:
      return "Erro ao fazer login";
  }
}

export default function LoginPage() {
  const { login, loginWithGoogle } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      router.push("/dashboard");
    } catch (err: any) {
      setError(firebaseErrorMessage(err.code) || err.message || "Erro ao fazer login");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleLogin() {
    setError("");
    setLoading(true);
    try {
      await loginWithGoogle();
      router.push("/dashboard");
    } catch (err: any) {
      const msg = firebaseErrorMessage(err.code);
      if (!msg) return; // popup closed
      setError(msg || err.message || "Erro ao fazer login com Google");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="center-page">
      <div className="card" style={{ width: 400 }}>
        <h2 className="text-center">ITSign</h2>
        <p className="text-center text-muted text-sm">Entre na sua conta</p>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>E-mail</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="form-group">
            <label>Senha</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <div style={{ textAlign: "right", marginBottom: 12 }}>
            <Link href="/forgot-password" style={{ fontSize: "0.85rem" }}>Esqueci minha senha</Link>
          </div>
          <button className="btn btn-primary" style={{ width: "100%" }} disabled={loading}>
            {loading ? "Entrando…" : "Entrar"}
          </button>
        </form>

        <div style={{
          display: "flex", alignItems: "center", gap: 12, margin: "20px 0",
          color: "var(--fg-muted)", fontSize: "0.85rem",
        }}>
          <div style={{ flex: 1, height: 1, background: "var(--gray-200)" }} />
          ou
          <div style={{ flex: 1, height: 1, background: "var(--gray-200)" }} />
        </div>

        <button
          className="btn btn-secondary"
          style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
          onClick={handleGoogleLogin}
          disabled={loading}
        >
          <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59a14.5 14.5 0 010-9.18l-7.98-6.19a24.02 24.02 0 000 21.56l7.98-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
          Entrar com Google
        </button>
      </div>
    </main>
  );
}
