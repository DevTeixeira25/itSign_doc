"use client";

import { useAuth } from "../../lib/auth-context";
import { useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { api } from "../../lib/api";
import { loadPdfDocument, renderPdfPage } from "../../lib/pdf";
import Link from "next/link";
import SignaturePad from "../../components/SignaturePad";

type Step = "upload" | "place" | "sign" | "done";

export default function SelfSignPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [step, setStep] = useState<Step>("upload");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // PDF rendering
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pageContainerRef = useRef<HTMLDivElement>(null);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pdfRendered, setPdfRendered] = useState(false);

  // Signature field placement
  const [sigField, setSigField] = useState<{
    page: number;
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);

  // Signature data
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [showSigPad, setShowSigPad] = useState(false);
  const [savedDocId, setSavedDocId] = useState<string | null>(null);
  const [savedEnvelopeId, setSavedEnvelopeId] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [authLoading, user, router]);

  // Create file URL when file is selected
  useEffect(() => {
    if (file) {
      const url = URL.createObjectURL(file);
      setFileUrl(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [file]);

  // Load PDF
  useEffect(() => {
    if (!fileUrl) return;
    let cancelled = false;
    loadPdfDocument(fileUrl).then((doc) => {
      if (!cancelled) {
        setPdfDoc(doc);
        setNumPages(doc.numPages);
        setCurrentPage(1);
      }
    }).catch((err) => console.error("Failed to load PDF:", err));
    return () => { cancelled = true; };
  }, [fileUrl]);

  // Render current page — re-runs when step changes so canvas is in the DOM
  useEffect(() => {
    if (!pdfDoc) return;
    // Small delay to let the canvas mount after a step change
    const timer = setTimeout(async () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      try {
        await renderPdfPage(pdfDoc, currentPage, canvas, 1.5);
        setPdfRendered(true);
      } catch (err) {
        console.error("PDF render error:", err);
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [pdfDoc, currentPage, step]);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      setTitle(f.name.replace(/\.[^.]+$/, ""));
    }
  }

  function goToPlaceStep() {
    if (!file) {
      setError("Selecione um arquivo PDF");
      return;
    }
    if (!title.trim()) {
      setError("Informe um título para o documento");
      return;
    }
    setError("");
    setStep("place");
  }

  // Place signature field by clicking on PDF
  function handlePdfClick(e: React.MouseEvent<HTMLDivElement>) {
    if (step !== "place") return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    // Default signature field: 25% wide, 8% tall
    setSigField({
      page: currentPage,
      x: Math.max(0, Math.min(x - 12.5, 75)),
      y: Math.max(0, Math.min(y - 4, 92)),
      width: 25,
      height: 8,
    });
  }

  // Drag to reposition
  function handleFieldMouseDown(e: React.MouseEvent) {
    e.stopPropagation();
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
  }

  function handleFieldMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!isDragging || !dragStart || !sigField) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const dx = ((e.clientX - dragStart.x) / rect.width) * 100;
    const dy = ((e.clientY - dragStart.y) / rect.height) * 100;
    setSigField({
      ...sigField,
      x: Math.max(0, Math.min(sigField.x + dx, 100 - sigField.width)),
      y: Math.max(0, Math.min(sigField.y + dy, 100 - sigField.height)),
    });
    setDragStart({ x: e.clientX, y: e.clientY });
  }

  function handleFieldMouseUp() {
    setIsDragging(false);
    setDragStart(null);
  }

  function confirmPlacement() {
    if (!sigField) {
      setError("Clique no documento para posicionar o campo de assinatura");
      return;
    }
    setError("");
    setStep("sign");
    setShowSigPad(true);
  }

  function handleSignatureSaved(dataUrl: string) {
    setSignatureDataUrl(dataUrl);
    setShowSigPad(false);
  }

  async function handleSave() {
    if (!file || !signatureDataUrl || !sigField) return;
    setError("");
    setLoading(true);
    try {
      // 1) Upload document
      const doc = await api.uploadDocument(file);
      setSavedDocId(doc.id);

      // 2) Create a self-sign envelope
      const envelope = await api.createEnvelope({
        title,
        documentId: doc.id,
        recipients: [
          {
            name: user!.name,
            email: user!.email,
            role: "signer",
            signingOrder: 1,
          },
        ],
      });

      // 3) Get the access token for the recipient (ourselves)
      const recipientToken = envelope.recipients[0].accessToken;

      // 4) Sign using the token
      await api.sign(recipientToken, {
        signatureData: signatureDataUrl,
        signatureType: "draw",
      });

      // 5) Send envelope (marks as sent then auto-completes)
      try {
        await api.sendEnvelope(envelope.id);
      } catch {
        // Already completed since single signer
      }

      setSavedEnvelopeId(envelope.id);
      setStep("done");
    } catch (err: any) {
      setError(typeof err === "object" && err.message ? err.message : "Erro ao salvar documento assinado");
    } finally {
      setLoading(false);
    }
  }

  if (authLoading || !user) return null;

  return (
    <>
      <header className="topbar">
        <h1>ITSign</h1>
        <nav>
          <Link href="/dashboard">Dashboard</Link>
        </nav>
      </header>

      <main className="container" style={{ maxWidth: step === "upload" ? 640 : 1100 }}>
        {/* Progress steps */}
        <div className="step-progress">
          <div className={`step-item ${step === "upload" ? "active" : ["place", "sign", "done"].includes(step) ? "completed" : ""}`}>
            <span className="step-num">1</span>
            <span className="step-label">Documento</span>
          </div>
          <div className="step-line" />
          <div className={`step-item ${step === "place" ? "active" : ["sign", "done"].includes(step) ? "completed" : ""}`}>
            <span className="step-num">2</span>
            <span className="step-label">Posicionar campo</span>
          </div>
          <div className="step-line" />
          <div className={`step-item ${step === "sign" ? "active" : step === "done" ? "completed" : ""}`}>
            <span className="step-num">3</span>
            <span className="step-label">Assinar</span>
          </div>
          <div className="step-line" />
          <div className={`step-item ${step === "done" ? "active" : ""}`}>
            <span className="step-num">4</span>
            <span className="step-label">Concluído</span>
          </div>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        {/* ── STEP 1: Upload ── */}
        {step === "upload" && (
          <div className="card">
            <h2>Selecione o documento para assinar</h2>
            <p className="text-sm text-muted">Faça upload do PDF que deseja assinar pessoalmente.</p>

            <div className="upload-area" onClick={() => document.getElementById("file-input")?.click()}>
              {file ? (
                <div className="upload-area-file">
                  <span className="upload-icon">📄</span>
                  <strong>{file.name}</strong>
                  <span className="text-sm text-muted">{(file.size / 1024).toFixed(0)} KB</span>
                </div>
              ) : (
                <>
                  <span className="upload-icon">📁</span>
                  <p><strong>Clique para selecionar</strong> ou arraste o arquivo aqui</p>
                  <p className="text-sm text-muted">PDF, até 50 MB</p>
                </>
              )}
              <input
                id="file-input"
                type="file"
                accept=".pdf"
                onChange={handleFileSelect}
                style={{ display: "none" }}
              />
            </div>

            <div className="form-group mt-16">
              <label>Título do documento</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Contrato de prestação de serviço"
              />
            </div>

            <button className="btn btn-primary" onClick={goToPlaceStep} disabled={!file}>
              Continuar →
            </button>
          </div>
        )}

        {/* ── STEP 2: Place signature field ── */}
        {step === "place" && (
          <div className="self-sign-layout">
            <div className="self-sign-sidebar">
              <div className="card">
                <h2>Posicionar assinatura</h2>
                <p className="text-sm text-muted">
                  Clique no documento ao lado para posicionar o campo de assinatura.
                  Arraste para reposicionar.
                </p>
                {sigField ? (
                  <div className="alert alert-success">
                    ✓ Campo posicionado na página {sigField.page}
                  </div>
                ) : (
                  <div className="alert" style={{ background: "#fffbeb", color: "#92400e", border: "1px solid #fde68a" }}>
                    Clique no PDF para posicionar
                  </div>
                )}
                <button
                  className="btn btn-primary"
                  style={{ width: "100%" }}
                  disabled={!sigField}
                  onClick={confirmPlacement}
                >
                  Confirmar posição →
                </button>
                <button
                  className="btn btn-secondary mt-16"
                  style={{ width: "100%" }}
                  onClick={() => { setStep("upload"); setSigField(null); }}
                >
                  ← Voltar
                </button>
              </div>
            </div>

            <div className="self-sign-pdf">
              {!pdfDoc ? (
                <div className="pdf-loading">
                  <div className="loader" />
                  <p>Carregando PDF…</p>
                </div>
              ) : (
              <>
              {/* Page navigation */}
              {numPages > 1 && (
                <div className="pdf-toolbar">
                  <button className="btn btn-secondary btn-sm" disabled={currentPage <= 1} onClick={() => setCurrentPage((p) => p - 1)}>
                    ←
                  </button>
                  <span className="text-sm">Página {currentPage} de {numPages}</span>
                  <button className="btn btn-secondary btn-sm" disabled={currentPage >= numPages} onClick={() => setCurrentPage((p) => p + 1)}>
                    →
                  </button>
                </div>
              )}

              <div
                className="pdf-page-container active"
                style={{ position: "relative", cursor: "crosshair" }}
                onClick={handlePdfClick}
                onMouseMove={handleFieldMouseMove}
                onMouseUp={handleFieldMouseUp}
                onMouseLeave={handleFieldMouseUp}
              >
                <canvas ref={canvasRef} />

                {sigField && sigField.page === currentPage && (
                  <div
                    className="sig-field-overlay"
                    style={{
                      left: `${sigField.x}%`,
                      top: `${sigField.y}%`,
                      width: `${sigField.width}%`,
                      height: `${sigField.height}%`,
                    }}
                    onMouseDown={handleFieldMouseDown}
                  >
                    <span className="sig-field-label">✍️ Assinatura</span>
                  </div>
                )}
              </div>
              </>
              )}
            </div>
          </div>
        )}

        {/* ── STEP 3: Sign ── */}
        {step === "sign" && (
          <div className="self-sign-layout">
            <div className="self-sign-sidebar">
              <div className="card">
                <h2>Assinar documento</h2>
                <p className="text-sm text-muted">
                  {signatureDataUrl
                    ? "Assinatura capturada. Revise no documento e salve."
                    : "Desenhe ou digite sua assinatura."}
                </p>

                {!signatureDataUrl ? (
                  <button
                    className="btn btn-primary"
                    style={{ width: "100%" }}
                    onClick={() => setShowSigPad(true)}
                  >
                    ✏️ Criar assinatura
                  </button>
                ) : (
                  <>
                    <div className="sig-preview-box">
                      <img src={signatureDataUrl} alt="Sua assinatura" />
                    </div>
                    <button
                      className="btn btn-secondary mt-16"
                      style={{ width: "100%" }}
                      onClick={() => { setSignatureDataUrl(null); setShowSigPad(true); }}
                    >
                      Refazer assinatura
                    </button>
                    <button
                      className="btn btn-primary mt-16"
                      style={{ width: "100%", padding: "14px" }}
                      onClick={handleSave}
                      disabled={loading}
                    >
                      {loading ? "Salvando…" : "💾 Salvar documento assinado"}
                    </button>
                  </>
                )}

                <button
                  className="btn btn-secondary mt-16"
                  style={{ width: "100%" }}
                  onClick={() => { setStep("place"); setSignatureDataUrl(null); }}
                >
                  ← Voltar
                </button>
              </div>
            </div>

            <div className="self-sign-pdf">
              {numPages > 1 && (
                <div className="pdf-toolbar">
                  <button className="btn btn-secondary btn-sm" disabled={currentPage <= 1} onClick={() => setCurrentPage((p) => p - 1)}>
                    ←
                  </button>
                  <span className="text-sm">Página {currentPage} de {numPages}</span>
                  <button className="btn btn-secondary btn-sm" disabled={currentPage >= numPages} onClick={() => setCurrentPage((p) => p + 1)}>
                    →
                  </button>
                </div>
              )}

              <div className="pdf-page-container active" style={{ position: "relative" }}>
                <canvas ref={canvasRef} />

                {sigField && sigField.page === currentPage && (
                  <div
                    className="sig-field-overlay signed"
                    style={{
                      left: `${sigField.x}%`,
                      top: `${sigField.y}%`,
                      width: `${sigField.width}%`,
                      height: `${sigField.height}%`,
                    }}
                  >
                    {signatureDataUrl ? (
                      <img src={signatureDataUrl} alt="Assinatura" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                    ) : (
                      <span className="sig-field-label">✍️ Assinatura</span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Signature pad modal */}
            {showSigPad && (
              <div className="modal-overlay" onClick={() => setShowSigPad(false)}>
                <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                  <h2>Sua assinatura</h2>
                  <SignaturePad
                    onSave={handleSignatureSaved}
                    onCancel={() => setShowSigPad(false)}
                    width={500}
                    height={180}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── STEP 4: Done ── */}
        {step === "done" && (
          <div className="card text-center" style={{ maxWidth: 560, margin: "0 auto" }}>
            <div style={{ fontSize: "3rem" }}>✅</div>
            <h2>Documento assinado com sucesso!</h2>
            <p className="text-muted">
              O documento <strong>{title}</strong> foi assinado e salvo.
            </p>
            <div className="flex gap-8 justify-center mt-24" style={{ justifyContent: "center" }}>
              {savedEnvelopeId && (
                <Link href={`/envelopes/${savedEnvelopeId}`} className="btn btn-primary">
                  Ver detalhes
                </Link>
              )}
              <Link href="/dashboard" className="btn btn-secondary">
                Voltar ao Dashboard
              </Link>
              <button className="btn btn-secondary" onClick={() => {
                setStep("upload");
                setFile(null);
                setFileUrl(null);
                setPdfDoc(null);
                setSigField(null);
                setSignatureDataUrl(null);
                setTitle("");
                setSavedDocId(null);
                setSavedEnvelopeId(null);
                setError("");
              }}>
                Assinar outro documento
              </button>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
