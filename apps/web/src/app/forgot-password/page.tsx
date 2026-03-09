"use client";

import { useState } from "react";
import { useAuth } from "../../lib/auth-context";
import Link from "next/link";

function firebaseErrorMessage(code: string): string {
  switch (code) {
    case "auth/user-not-found":
      return "Nenhuma conta encontrada com este e-mail";
    case "auth/invalid-email":
      return "E-mail inválido";
    case "auth/too-many-requests":
      return "Muitas tentativas. Tente novamente mais tarde.";
    default:
      return "Erro ao enviar e-mail de recuperação";
  }
}

export default function ForgotPasswordPage() {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess(false);
    setLoading(true);
    try {
      await resetPassword(email);
      setSuccess(true);
    } catch (err: any) {
      setError(firebaseErrorMessage(err.code) || err.message || "Erro ao enviar e-mail");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="center-page">
      <div className="card" style={{ width: 400 }}>
        <h2 className="text-center">Recuperar senha</h2>
        <p className="text-center text-muted text-sm">
          Informe seu e-mail e enviaremos um link para redefinir sua senha.
        </p>

        {error && <div className="alert alert-error">{error}</div>}

        {success ? (
          <div className="alert alert-success" style={{ marginTop: 16 }}>
            E-mail de recuperação enviado! Verifique sua caixa de entrada e spam.
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>E-mail</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                placeholder="seu@email.com"
              />
            </div>
            <button className="btn btn-primary" style={{ width: "100%" }} disabled={loading}>
              {loading ? "Enviando…" : "Enviar link de recuperação"}
            </button>
          </form>
        )}

        <p className="text-center text-sm mt-16">
          <Link href="/login">Voltar ao login</Link>
        </p>
      </div>
    </main>
  );
}
