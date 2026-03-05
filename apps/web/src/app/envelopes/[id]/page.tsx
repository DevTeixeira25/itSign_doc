"use client";

import { useAuth } from "../../../lib/auth-context";
import { useRouter, useParams } from "next/navigation";
import { useState, useEffect } from "react";
import { api } from "../../../lib/api";
import Link from "next/link";

const STATUS_LABELS: Record<string, string> = {
  draft: "Rascunho",
  sent: "Enviado",
  in_progress: "Em andamento",
  completed: "Concluído",
  canceled: "Cancelado",
  expired: "Expirado",
};

const ACTION_LABELS: Record<string, string> = {
  envelope_created: "Envelope criado",
  envelope_sent: "Envelope enviado",
  envelope_completed: "Envelope concluído",
  envelope_canceled: "Envelope cancelado",
  document_uploaded: "Documento enviado",
  recipient_viewed: "Destinatário visualizou",
  signature_completed: "Assinatura realizada",
  certificate_generated: "Certificado gerado",
  user_login: "Login",
};

export default function EnvelopeDetailPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const envelopeId = params.id as string;
  const [envelope, setEnvelope] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login");
      return;
    }
    if (user && envelopeId) {
      api.getEnvelope(envelopeId).then((data) => {
        setEnvelope(data);
        setLoading(false);
      });
    }
  }, [user, authLoading, envelopeId, router]);

  if (authLoading || !user) return null;

  async function handleSend() {
    setActionLoading(true);
    await api.sendEnvelope(envelopeId);
    const data = await api.getEnvelope(envelopeId);
    setEnvelope(data);
    setActionLoading(false);
  }

  async function handleCancel() {
    if (!confirm("Tem certeza que deseja cancelar este envelope?")) return;
    setActionLoading(true);
    await api.cancelEnvelope(envelopeId);
    const data = await api.getEnvelope(envelopeId);
    setEnvelope(data);
    setActionLoading(false);
  }

  if (loading) {
    return (
      <main className="container center-page">
        <div className="loader" />
      </main>
    );
  }

  return (
    <>
      <header className="topbar">
        <h1>ITSign</h1>
        <nav>
          <Link href="/dashboard">Dashboard</Link>
        </nav>
      </header>

      <main className="container">
        <div className="flex justify-between items-center mb-16">
          <div>
            <h2>{envelope.title}</h2>
            <span className={`badge badge-${envelope.status}`}>
              {STATUS_LABELS[envelope.status] ?? envelope.status}
            </span>
          </div>
          <div className="flex gap-8">
            {envelope.status === "draft" && (
              <button className="btn btn-primary" onClick={handleSend} disabled={actionLoading}>
                Enviar
              </button>
            )}
            {(envelope.status === "draft" || envelope.status === "sent") && (
              <button className="btn btn-danger" onClick={handleCancel} disabled={actionLoading}>
                Cancelar
              </button>
            )}
          </div>
        </div>

        {/* Document info */}
        <div className="card">
          <h2>Documento</h2>
          <p>
            <strong>{envelope.document.fileName}</strong>{" "}
            <span className="text-muted text-sm">({envelope.document.mimeType})</span>
          </p>
        </div>

        {/* Recipients */}
        <div className="card">
          <h2>Destinatários</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Ordem</th>
                  <th>Nome</th>
                  <th>E-mail</th>
                  <th>Papel</th>
                  <th>Assinado em</th>
                </tr>
              </thead>
              <tbody>
                {envelope.recipients.map((r: any) => (
                  <tr key={r.id}>
                    <td>{r.signing_order}</td>
                    <td>{r.name}</td>
                    <td>{r.email}</td>
                    <td>
                      {{
                        signer: "Signatário",
                        approver: "Aprovador",
                        viewer: "Visualizador",
                      }[r.role as string] ?? r.role}
                    </td>
                    <td>
                      {r.signed_at ? (
                        <span style={{ color: "var(--success)" }}>
                          {new Date(r.signed_at).toLocaleString("pt-BR")}
                        </span>
                      ) : (
                        <span className="text-muted">Pendente</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Audit trail */}
        <div className="card">
          <h2>Trilha de Auditoria</h2>
          {envelope.auditTrail.length === 0 ? (
            <p className="text-muted">Nenhum evento registrado.</p>
          ) : (
            <ul className="timeline">
              {envelope.auditTrail.map((event: any) => (
                <li key={event.id}>
                  <strong>{ACTION_LABELS[event.action] ?? event.action}</strong>
                  {event.actor_email && (
                    <span className="text-muted"> — {event.actor_email}</span>
                  )}
                  <br />
                  <span className="text-sm text-muted">
                    {new Date(event.created_at).toLocaleString("pt-BR")}
                    {event.ip_address && ` · IP: ${event.ip_address}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </>
  );
}
