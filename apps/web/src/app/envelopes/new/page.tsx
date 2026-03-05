"use client";

import { useAuth } from "../../../lib/auth-context";
import { useRouter } from "next/navigation";
import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "../../../lib/api";
import { loadPdfDocument, renderPdfPage } from "../../../lib/pdf";
import Link from "next/link";

interface RecipientInput {
  name: string;
  email: string;
  role: "signer" | "approver" | "viewer";
  signingOrder: number;
}

type Step = "upload" | "recipients" | "preview" | "done";

export default function NewEnvelopePage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState<Step>("upload");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [recipients, setRecipients] = useState<RecipientInput[]>([
    { name: "", email: "", role: "signer", signingOrder: 1 },
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<any>(null);

  // PDF
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [authLoading, user, router]);

  useEffect(() => {
    if (file) {
      const url = URL.createObjectURL(file);
      setFileUrl(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [file]);

  useEffect(() => {
    if (!fileUrl) return;
    let cancelled = false;
    loadPdfDocument(fileUrl).then((doc) => {
      if (!cancelled) {
        setPdfDoc(doc);
        setNumPages(doc.numPages);
      }
    }).catch((err) => console.error("Failed to load PDF:", err));
    return () => { cancelled = true; };
  }, [fileUrl]);

  const renderPage = useCallback(async () => {
    if (!pdfDoc || !canvasRef.current) return;
    await renderPdfPage(pdfDoc, currentPage, canvasRef.current, 1.3);
  }, [pdfDoc, currentPage]);

  useEffect(() => { renderPage(); }, [renderPage]);

  if (authLoading || !user) return null;

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      if (!title) setTitle(f.name.replace(/\.[^.]+$/, ""));
    }
  }

  function goToRecipients() {
    if (!file || !title.trim()) {
      setError("Informe o título e selecione um arquivo");
      return;
    }
    setError("");
    setStep("recipients");
  }

  function addRecipient() {
    setRecipients((prev) => [
      ...prev,
      { name: "", email: "", role: "signer", signingOrder: prev.length + 1 },
    ]);
  }

  function updateRecipient(index: number, field: keyof RecipientInput, value: string | number) {
    setRecipients((prev) =>
      prev.map((r, i) => (i === index ? { ...r, [field]: value } : r))
    );
  }

  function removeRecipient(index: number) {
    setRecipients((prev) => prev.filter((_, i) => i !== index));
  }

  function goToPreview() {
    const valid = recipients.every((r) => r.name.trim() && r.email.trim());
    if (!valid) {
      setError("Preencha nome e e-mail de todos os destinatários");
      return;
    }
    setError("");
    setStep("preview");
  }

  async function handleCreate() {
    setError("");
    setLoading(true);
    try {
      const doc = await api.uploadDocument(file!);
      setDocumentId(doc.id);

      const envelope = await api.createEnvelope({
        title,
        documentId: doc.id,
        recipients,
      });

      await api.sendEnvelope(envelope.id);
      setResult(envelope);
      setStep("done");
    } catch (err: any) {
      setError(err.message ?? "Erro ao criar envelope");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <header className="topbar">
        <h1>ITSign</h1>
        <nav>
          <Link href="/dashboard">Dashboard</Link>
          <Link href="/self-sign">Assinar</Link>
          <Link href="/envelopes/new">Enviar para assinatura</Link>
        </nav>
      </header>

      <main className="container" style={{ maxWidth: step === "preview" ? 1100 : 720 }}>
        {/* Progress */}
        <div className="step-progress">
          <div className={`step-item ${step === "upload" ? "active" : "completed"}`}>
            <span className="step-num">1</span>
            <span className="step-label">Documento</span>
          </div>
          <div className="step-line" />
          <div className={`step-item ${step === "recipients" ? "active" : ["preview", "done"].includes(step) ? "completed" : ""}`}>
            <span className="step-num">2</span>
            <span className="step-label">Destinatários</span>
          </div>
          <div className="step-line" />
          <div className={`step-item ${step === "preview" ? "active" : step === "done" ? "completed" : ""}`}>
            <span className="step-num">3</span>
            <span className="step-label">Revisar e enviar</span>
          </div>
          <div className="step-line" />
          <div className={`step-item ${step === "done" ? "active" : ""}`}>
            <span className="step-num">4</span>
            <span className="step-label">Enviado</span>
          </div>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        {/* ── STEP 1: Upload ── */}
        {step === "upload" && (
          <div className="card">
            <h2>1. Selecione o documento</h2>
            <p className="text-sm text-muted">Escolha o PDF que será enviado para assinatura.</p>

            <div className="upload-area" onClick={() => document.getElementById("new-file-input")?.click()}>
              {file ? (
                <div className="upload-area-file">
                  <span className="upload-icon">📄</span>
                  <strong>{file.name}</strong>
                  <span className="text-sm text-muted">{(file.size / 1024).toFixed(0)} KB</span>
                </div>
              ) : (
                <>
                  <span className="upload-icon">📁</span>
                  <p><strong>Clique para selecionar</strong> ou arraste o arquivo</p>
                  <p className="text-sm text-muted">PDF, até 50 MB</p>
                </>
              )}
              <input
                id="new-file-input"
                type="file"
                accept=".pdf"
                onChange={handleFileSelect}
                style={{ display: "none" }}
              />
            </div>

            <div className="form-group mt-16">
              <label>Título do envelope</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Contrato de prestação de serviço"
              />
            </div>

            <button className="btn btn-primary" onClick={goToRecipients} disabled={!file}>
              Continuar →
            </button>
          </div>
        )}

        {/* ── STEP 2: Recipients ── */}
        {step === "recipients" && (
          <div className="card">
            <h2>2. Destinatários</h2>
            <p className="text-sm text-muted mb-16">
              Defina quem irá receber e assinar o documento <strong>{file?.name}</strong>.
            </p>

            {recipients.map((r, i) => (
              <div key={i} className="recipient-row">
                <div className="form-group" style={{ flex: 2, marginBottom: 0 }}>
                  <label>Nome</label>
                  <input
                    value={r.name}
                    onChange={(e) => updateRecipient(i, "name", e.target.value)}
                    placeholder="João Silva"
                  />
                </div>
                <div className="form-group" style={{ flex: 2, marginBottom: 0 }}>
                  <label>E-mail</label>
                  <input
                    type="email"
                    value={r.email}
                    onChange={(e) => updateRecipient(i, "email", e.target.value)}
                    placeholder="joao@email.com"
                  />
                </div>
                <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                  <label>Papel</label>
                  <select
                    value={r.role}
                    onChange={(e) => updateRecipient(i, "role", e.target.value)}
                  >
                    <option value="signer">Signatário</option>
                    <option value="approver">Aprovador</option>
                    <option value="viewer">Visualizador</option>
                  </select>
                </div>
                <div className="form-group" style={{ flex: 0.5, marginBottom: 0 }}>
                  <label>Ordem</label>
                  <input
                    type="number"
                    min={1}
                    value={r.signingOrder}
                    onChange={(e) => updateRecipient(i, "signingOrder", Number(e.target.value))}
                  />
                </div>
                {recipients.length > 1 && (
                  <button
                    className="btn btn-danger btn-sm"
                    style={{ marginTop: 18 }}
                    onClick={() => removeRecipient(i)}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}

            <div className="flex gap-8 mt-16">
              <button className="btn btn-secondary" onClick={addRecipient}>
                + Adicionar destinatário
              </button>
            </div>
            <div className="flex gap-8 mt-16">
              <button className="btn btn-secondary" onClick={() => setStep("upload")}>
                ← Voltar
              </button>
              <button className="btn btn-primary" onClick={goToPreview}>
                Revisar →
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 3: Preview ── */}
        {step === "preview" && (
          <div className="self-sign-layout">
            <div className="self-sign-sidebar">
              <div className="card">
                <h2>Resumo</h2>
                <div className="form-group">
                  <label>Título</label>
                  <p style={{ margin: 0 }}>{title}</p>
                </div>
                <div className="form-group">
                  <label>Documento</label>
                  <p style={{ margin: 0 }}>{file?.name}</p>
                </div>
                <div className="form-group">
                  <label>Destinatários ({recipients.length})</label>
                  {recipients.map((r, i) => (
                    <div key={i} className="text-sm" style={{ padding: "4px 0", borderBottom: "1px solid var(--gray-100)" }}>
                      <strong>{r.name}</strong><br />
                      <span className="text-muted">{r.email}</span>
                      <span className={`badge badge-${r.role === "signer" ? "sent" : "draft"}`} style={{ marginLeft: 8 }}>
                        {r.role === "signer" ? "Signatário" : r.role === "approver" ? "Aprovador" : "Visualizador"}
                      </span>
                    </div>
                  ))}
                </div>

                <button
                  className="btn btn-primary"
                  style={{ width: "100%", padding: "14px" }}
                  onClick={handleCreate}
                  disabled={loading}
                >
                  {loading ? "Enviando…" : "📤 Enviar para assinatura"}
                </button>
                <button
                  className="btn btn-secondary mt-16"
                  style={{ width: "100%" }}
                  onClick={() => setStep("recipients")}
                >
                  ← Voltar
                </button>
              </div>
            </div>

            <div className="self-sign-pdf">
              {numPages > 1 && (
                <div className="pdf-toolbar">
                  <button className="btn btn-secondary btn-sm" disabled={currentPage <= 1} onClick={() => setCurrentPage((p) => p - 1)}>←</button>
                  <span className="text-sm">Página {currentPage} de {numPages}</span>
                  <button className="btn btn-secondary btn-sm" disabled={currentPage >= numPages} onClick={() => setCurrentPage((p) => p + 1)}>→</button>
                </div>
              )}
              <div className="pdf-page-container active">
                <canvas ref={canvasRef} />
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 4: Done ── */}
        {step === "done" && result && (
          <div className="card text-center" style={{ maxWidth: 600, margin: "0 auto" }}>
            <div style={{ fontSize: "3rem" }}>📤</div>
            <h2>Envelope enviado com sucesso!</h2>
            <p className="text-muted">
              O documento <strong>{title}</strong> foi enviado para assinatura.
            </p>

            <div className="card" style={{ textAlign: "left", background: "var(--gray-50)" }}>
              <h3 style={{ fontSize: "0.95rem" }}>Links de assinatura</h3>
              <p className="text-sm text-muted">Compartilhe os links abaixo com os destinatários:</p>
              {result.recipients.map((r: any) => (
                <div key={r.id} style={{ marginBottom: 12, padding: "8px 12px", background: "#fff", borderRadius: "var(--radius)", border: "1px solid var(--gray-200)" }}>
                  <strong>{r.name}</strong> <span className="text-muted text-sm">({r.email})</span>
                  <div style={{ marginTop: 4 }}>
                    <code style={{ fontSize: "0.75rem", wordBreak: "break-all", color: "var(--primary)" }}>
                      {typeof window !== "undefined" ? window.location.origin : ""}/sign/{r.accessToken}
                    </code>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-8 mt-16" style={{ justifyContent: "center" }}>
              {result.id && (
                <Link href={`/envelopes/${result.id}`} className="btn btn-primary">
                  Ver envelope
                </Link>
              )}
              <Link href="/dashboard" className="btn btn-secondary">
                Dashboard
              </Link>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
