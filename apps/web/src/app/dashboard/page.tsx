"use client";

import { useAuth } from "../../lib/auth-context";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import Link from "next/link";

const STATUS_LABELS: Record<string, string> = {
  draft: "Rascunho",
  sent: "Enviado",
  in_progress: "Em andamento",
  completed: "Concluído",
  canceled: "Cancelado",
  expired: "Expirado",
};

export default function DashboardPage() {
  const { user, loading: authLoading, logout } = useAuth();
  const router = useRouter();
  const [envelopes, setEnvelopes] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login");
      return;
    }
    if (user) {
      api.listEnvelopes().then((res: any) => {
        setEnvelopes(res.data);
        setTotal(res.total);
        setLoading(false);
      });
    }
  }, [user, authLoading, router]);

  if (authLoading || !user) return null;

  return (
    <>
      <header className="topbar">
        <h1>ITSign</h1>
        <nav>
          <Link href="/dashboard">Dashboard</Link>
          <Link href="/self-sign">Assinar</Link>
          <Link href="/envelopes/new">Enviar para assinatura</Link>
          <Link href="/verify/_">Verificar</Link>
          <button onClick={logout}>Sair</button>
        </nav>
      </header>

      <main className="container">
        <div className="flex justify-between items-center mb-16">
          <div>
            <h2>Dashboard</h2>
            <p className="text-muted text-sm">Olá, {user.name}</p>
          </div>
        </div>

        {/* Action cards */}
        <div className="action-cards mb-16">
          <Link href="/self-sign" className="action-card action-card-sign">
            <span className="action-card-icon">✍️</span>
            <h3>Assinar documento</h3>
            <p>Faça upload de um PDF, posicione o campo de assinatura e assine</p>
          </Link>
          <Link href="/envelopes/new" className="action-card action-card-send">
            <span className="action-card-icon">📤</span>
            <h3>Enviar para assinatura</h3>
            <p>Envie um documento para outras pessoas assinarem</p>
          </Link>
          <Link href="/verify/_" className="action-card" style={{ borderColor: "#bfdbfe", background: "#eff6ff" }}>
            <span className="action-card-icon">🔍</span>
            <h3>Verificar documento</h3>
            <p>Verifique a autenticidade de um documento assinado</p>
          </Link>
        </div>

        {/* Stats */}
        <div className="flex gap-16 mb-16">
          <div className="card" style={{ flex: 1 }}>
            <p className="text-muted text-sm">Total de envelopes</p>
            <p style={{ fontSize: "1.5rem", fontWeight: 700 }}>{total}</p>
          </div>
          <div className="card" style={{ flex: 1 }}>
            <p className="text-muted text-sm">Concluídos</p>
            <p style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--success)" }}>
              {envelopes.filter((e) => e.status === "completed").length}
            </p>
          </div>
          <div className="card" style={{ flex: 1 }}>
            <p className="text-muted text-sm">Pendentes</p>
            <p style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--warning)" }}>
              {envelopes.filter((e) => e.status === "sent" || e.status === "in_progress").length}
            </p>
          </div>
        </div>

        {/* Envelope list */}
        <div className="card">
          <h2>Envelopes recentes</h2>
          {loading ? (
            <p className="text-muted">Carregando…</p>
          ) : envelopes.length === 0 ? (
            <p className="text-muted">Nenhum envelope criado ainda.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Título</th>
                    <th>Status</th>
                    <th>Criado em</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {envelopes.map((env) => (
                    <tr key={env.id}>
                      <td>{env.title}</td>
                      <td>
                        <span className={`badge badge-${env.status}`}>
                          {STATUS_LABELS[env.status] ?? env.status}
                        </span>
                      </td>
                      <td className="text-sm text-muted">
                        {new Date(env.created_at).toLocaleDateString("pt-BR")}
                      </td>
                      <td>
                        <Link href={`/envelopes/${env.id}`} className="btn btn-secondary" style={{ padding: "4px 12px", fontSize: "0.8rem" }}>
                          Ver
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
