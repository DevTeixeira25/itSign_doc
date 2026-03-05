"use client";

import { useParams } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { api } from "../../../lib/api";

export default function SignPage() {
  const params = useParams();
  const token = params.token as string;
  const [info, setInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [signatureType, setSignatureType] = useState<"draw" | "type">("draw");
  const [typedName, setTypedName] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);

  useEffect(() => {
    api
      .getSigningInfo(token)
      .then((data) => {
        setInfo(data);
        if (data.alreadySigned) setDone(true);
      })
      .catch((err) => setError(err.message ?? "Link inválido"))
      .finally(() => setLoading(false));
  }, [token]);

  // ── Canvas drawing ──────────────────────────────────────
  function startDraw(e: React.PointerEvent) {
    isDrawing.current = true;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const rect = canvas.getBoundingClientRect();
    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
  }

  function draw(e: React.PointerEvent) {
    if (!isDrawing.current) return;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const rect = canvas.getBoundingClientRect();
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#0f172a";
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.stroke();
  }

  function stopDraw() {
    isDrawing.current = false;
  }

  function clearCanvas() {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  async function handleSign() {
    setError("");
    setSigning(true);

    let signatureData = "";
    if (signatureType === "draw") {
      signatureData = canvasRef.current?.toDataURL("image/png") ?? "";
      if (!signatureData || signatureData === "data:,") {
        setError("Desenhe sua assinatura");
        setSigning(false);
        return;
      }
    } else {
      signatureData = typedName;
      if (!typedName.trim()) {
        setError("Digite seu nome");
        setSigning(false);
        return;
      }
    }

    try {
      await api.sign(token, { signatureData, signatureType });
      setDone(true);
    } catch (err: any) {
      setError(err.message ?? "Erro ao assinar");
    } finally {
      setSigning(false);
    }
  }

  if (loading) {
    return (
      <main className="center-page">
        <div className="loader" />
        <p>Carregando documento…</p>
      </main>
    );
  }

  if (error && !info) {
    return (
      <main className="center-page">
        <div className="card" style={{ maxWidth: 500, textAlign: "center" }}>
          <h2>Erro</h2>
          <p className="text-muted">{error}</p>
        </div>
      </main>
    );
  }

  if (done) {
    return (
      <main className="center-page">
        <div className="card" style={{ maxWidth: 500, textAlign: "center" }}>
          <div style={{ fontSize: "3rem" }}>✓</div>
          <h2>Documento assinado!</h2>
          <p className="text-muted">
            Sua assinatura foi registrada com sucesso para o documento{" "}
            <strong>{info?.envelopeTitle}</strong>.
          </p>
          <p className="text-sm text-muted mt-16">
            Você pode fechar esta página.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="container" style={{ maxWidth: 640 }}>
      <div className="card text-center" style={{ marginBottom: 8 }}>
        <h1 style={{ color: "var(--primary)", margin: 0 }}>ITSign</h1>
      </div>

      <div className="card">
        <h2>Assinar Documento</h2>
        <p className="text-sm text-muted">
          Olá <strong>{info.recipientName}</strong>, você foi convidado a assinar:
        </p>
        <p>
          <strong>{info.envelopeTitle}</strong>
          <br />
          <span className="text-sm text-muted">Arquivo: {info.documentFileName}</span>
        </p>
      </div>

      <div className="card">
        <h2>Sua assinatura</h2>

        {error && <div className="alert alert-error">{error}</div>}

        <div className="flex gap-8 mb-16">
          <button
            className={`btn ${signatureType === "draw" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setSignatureType("draw")}
          >
            Desenhar
          </button>
          <button
            className={`btn ${signatureType === "type" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setSignatureType("type")}
          >
            Digitar nome
          </button>
        </div>

        {signatureType === "draw" ? (
          <>
            <canvas
              ref={canvasRef}
              width={580}
              height={200}
              className="signature-pad"
              onPointerDown={startDraw}
              onPointerMove={draw}
              onPointerUp={stopDraw}
              onPointerLeave={stopDraw}
            />
            <button
              className="btn btn-secondary mt-16"
              onClick={clearCanvas}
              style={{ padding: "4px 12px", fontSize: "0.8rem" }}
            >
              Limpar
            </button>
          </>
        ) : (
          <div className="form-group">
            <label>Nome completo</label>
            <input
              value={typedName}
              onChange={(e) => setTypedName(e.target.value)}
              placeholder={info.recipientName}
              style={{ fontFamily: "'Brush Script MT', cursive", fontSize: "1.5rem" }}
            />
          </div>
        )}

        <div className="mt-24">
          <button
            className="btn btn-primary"
            style={{ width: "100%", padding: "14px" }}
            onClick={handleSign}
            disabled={signing}
          >
            {signing ? "Assinando…" : "Assinar documento"}
          </button>
          <p className="text-sm text-muted text-center mt-16">
            Ao assinar, você concorda que esta assinatura eletrônica tem validade legal.
          </p>
        </div>
      </div>
    </main>
  );
}
