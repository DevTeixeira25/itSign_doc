"use client";

import { useAuth } from "../../lib/auth-context";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";

export default function ProfilePage() {
  const { user, firebaseUser, loading: authLoading, logout, updateProfile, resetPassword } = useAuth();
  const router = useRouter();

  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [resetSent, setResetSent] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login");
      return;
    }
    if (user) {
      setName(user.name);
    }
  }, [user, authLoading, router]);

  async function handleUpdateProfile(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setSaving(true);
    try {
      await updateProfile({ name });
      setSuccess("Perfil atualizado com sucesso!");
    } catch (err: any) {
      setError(err.message || "Erro ao atualizar perfil");
    } finally {
      setSaving(false);
    }
  }

  async function handleResetPassword() {
    if (!user?.email) return;
    setError("");
    setSuccess("");
    try {
      await resetPassword(user.email);
      setResetSent(true);
      setSuccess("E-mail de redefinição de senha enviado!");
    } catch (err: any) {
      setError(err.message || "Erro ao enviar e-mail");
    }
  }

  if (authLoading || !user) return null;

  const isPasswordUser = firebaseUser?.providerData?.some(p => p.providerId === "password");

  return (
    <>
      <header className="topbar">
        <h1><Link href="/dashboard" style={{ textDecoration: "none", color: "var(--primary)" }}>ITSign</Link></h1>
        <nav>
          <Link href="/dashboard">Dashboard</Link>
          <Link href="/profile">Perfil</Link>
          <button onClick={logout}>Sair</button>
        </nav>
      </header>

      <main className="container">
        <h2>Meu Perfil</h2>
        <p className="text-muted text-sm mb-16">Gerencie suas informações pessoais</p>

        {error && <div className="alert alert-error">{error}</div>}
        {success && <div className="alert alert-success">{success}</div>}

        {/* Profile info */}
        <div className="card">
          <h3 style={{ margin: "0 0 16px", fontSize: "1rem" }}>Informações pessoais</h3>
          <form onSubmit={handleUpdateProfile}>
            <div className="form-group">
              <label>Nome</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                minLength={2}
              />
            </div>
            <div className="form-group">
              <label>E-mail</label>
              <input
                type="email"
                value={user.email}
                disabled
                style={{ background: "var(--gray-100)", color: "var(--gray-500)" }}
              />
              <span style={{ fontSize: "0.8rem", color: "var(--gray-500)" }}>
                O e-mail não pode ser alterado
              </span>
            </div>
            <button className="btn btn-primary" disabled={saving || name === user.name}>
              {saving ? "Salvando…" : "Salvar alterações"}
            </button>
          </form>
        </div>

        {/* Security */}
        <div className="card">
          <h3 style={{ margin: "0 0 16px", fontSize: "1rem" }}>Segurança</h3>

          {isPasswordUser ? (
            <div>
              <p className="text-sm text-muted" style={{ margin: "0 0 12px" }}>
                Para alterar sua senha, enviaremos um link de redefinição para o seu e-mail.
              </p>
              <button
                className="btn btn-secondary"
                onClick={handleResetPassword}
                disabled={resetSent}
              >
                {resetSent ? "E-mail enviado ✓" : "Redefinir senha"}
              </button>
            </div>
          ) : (
            <p className="text-sm text-muted">
              Você faz login via Google. A senha é gerenciada pela sua conta Google.
            </p>
          )}
        </div>

        {/* Account info */}
        <div className="card">
          <h3 style={{ margin: "0 0 16px", fontSize: "1rem" }}>Conta</h3>
          <div className="flex gap-16" style={{ flexWrap: "wrap" }}>
            <div>
              <p className="text-sm text-muted" style={{ margin: 0 }}>ID do usuário</p>
              <p style={{ margin: "4px 0 0", fontSize: "0.85rem", fontFamily: "monospace" }}>{user.id}</p>
            </div>
            <div>
              <p className="text-sm text-muted" style={{ margin: 0 }}>Organização</p>
              <p style={{ margin: "4px 0 0", fontSize: "0.85rem", fontFamily: "monospace" }}>{user.organizationId}</p>
            </div>
            <div>
              <p className="text-sm text-muted" style={{ margin: 0 }}>Provedor de login</p>
              <p style={{ margin: "4px 0 0", fontSize: "0.85rem" }}>
                {firebaseUser?.providerData?.map(p => {
                  if (p.providerId === "password") return "E-mail/Senha";
                  if (p.providerId === "google.com") return "Google";
                  return p.providerId;
                }).join(", ")}
              </p>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
