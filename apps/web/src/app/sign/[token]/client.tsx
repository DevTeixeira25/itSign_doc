"use client";

import { useParams, useSearchParams, useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { api } from "../../../lib/api";
import CertificateUpload from "../../../components/CertificateUpload";
import GovBrSign from "../../../components/GovBrSign";
import PdfFormFieldsEditor, { type PdfFormFieldDefinition } from "../../../components/PdfFormFieldsEditor";

type SignMethod = "draw" | "type" | "certificate" | "govbr";

export default function SignPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = params.token as string;
  const [info, setInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [signMethod, setSignMethod] = useState<SignMethod>("draw");
  const [typedName, setTypedName] = useState("");
  const [formFields, setFormFields] = useState<PdfFormFieldDefinition[]>([]);
  const [formValues, setFormValues] = useState<Record<string, string | boolean | string[]>>({});
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);

  // Certificate / Gov.br results
  const [certResult, setCertResult] = useState<any>(null);
  const [govbrResult, setGovbrResult] = useState<any>(null);

  function getSignatureColor() {
    return document.documentElement.dataset.theme === "dark" ? "#ffffff" : "#0f172a";
  }

  useEffect(() => {
    api
      .getSigningInfo(token)
      .then((data: any) => {
        setInfo(data);
        if (data.alreadySigned) setDone(true);
        const fields = (data.formFields ?? []) as PdfFormFieldDefinition[];
        setFormFields(fields);
        setFormValues(Object.fromEntries(fields.flatMap((field) => field.value != null ? [[field.name, field.value]] : [])));
      })
      .catch((err: any) => setError(err.message ?? "Link inválido"))
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
    ctx.strokeStyle = getSignatureColor();
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

  function exportSignatureAsBlack(canvas: HTMLCanvasElement) {
    const output = document.createElement("canvas");
    output.width = canvas.width;
    output.height = canvas.height;
    const sourceCtx = canvas.getContext("2d")!;
    const targetCtx = output.getContext("2d")!;
    const imageData = sourceCtx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] > 0) {
        data[i] = 15;
        data[i + 1] = 23;
        data[i + 2] = 42;
      }
    }

    targetCtx.putImageData(imageData, 0, 0);
    return output.toDataURL("image/png");
  }

  // ── Electronic sign (draw / type) ──────────────────────
  async function handleSign() {
    setError("");
    setSigning(true);

    let signatureData = "";
    if (signMethod === "draw") {
      signatureData = canvasRef.current ? exportSignatureAsBlack(canvasRef.current) : "";
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
      await api.sign(token, {
        signatureData,
        signatureType: signMethod,
        formFields: normalizeFormValues(formValues),
      });
      setDone(true);
    } catch (err: any) {
      setError(err.message ?? "Erro ao assinar");
    } finally {
      setSigning(false);
    }
  }

  // ── Certificate ICP-Brasil sign ────────────────────────
  async function handleCertificateSign(certFile: File, certPassword: string) {
    setError("");
    setSigning(true);
    try {
      const result = await api.signWithCertificate({
        certificateFile: certFile,
        password: certPassword,
        recipientToken: token,
        envelopeId: info?.envelopeId ?? "",
        formFields: normalizeFormValues(),
      });
      setCertResult(result);
      setDone(true);
    } catch (err: any) {
      setError(err.message ?? "Erro ao assinar com certificado");
    } finally {
      setSigning(false);
    }
  }

  // ── Gov.br sign ────────────────────────────────────────
  async function handleGovBrSign() {
    setError("");
    setSigning(true);
    try {
      sessionStorage.setItem("sign_form_values", JSON.stringify(normalizeFormValues(formValues)));
      // Start Gov.br OAuth2 flow using public-authorize (no login needed)
      const { authUrl } = await api.govbrPublicAuthorize({
        recipientToken: token,
        returnPath: `/sign/${token}`,
      });
      // Redirect to Gov.br login page
      window.location.href = authUrl;
    } catch (err: any) {
      setError(err.message ?? "Erro ao iniciar assinatura Gov.br");
      setSigning(false);
    }
  }

  // ── Handle Gov.br callback return ────────────────────
  useEffect(() => {
    const govbrSessionId = searchParams.get("govbr_session");
    if (!govbrSessionId) return;
    const savedFormValues = typeof window !== "undefined" ? sessionStorage.getItem("sign_form_values") : null;
    const parsedFormValues = savedFormValues ? JSON.parse(savedFormValues) : normalizeFormValues(formValues);

    (async () => {
      setSigning(true);
      setError("");
      try {
        const result = await api.govbrSign(govbrSessionId, token, undefined, parsedFormValues);
        setGovbrResult(result);
        setDone(true);
        sessionStorage.removeItem("sign_form_values");
      } catch (err: any) {
        setError(err.message ?? "Erro ao assinar com Gov.br");
      } finally {
        setSigning(false);
      }
    })();
  }, [searchParams, token, formValues]);

  async function handleDownload() {
    try {
      const { blob, fileName } = await api.downloadSignedDocument(token);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.message ?? "Erro ao baixar documento");
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

          {certResult?.certificate && (
            <div style={{ textAlign: "left", marginTop: 16, padding: 12, background: "var(--gray-50)", borderRadius: 8, fontSize: "0.85rem" }}>
              <strong>🔐 Certificado ICP-Brasil</strong>
              <p style={{ margin: "4px 0" }}>Titular: {certResult.certificate.commonName}</p>
              {certResult.certificate.cpf && <p style={{ margin: "4px 0" }}>CPF: {certResult.certificate.cpf}</p>}
              <p style={{ margin: "4px 0" }}>Emissor: {certResult.certificate.issuer}</p>
              <p style={{ margin: "4px 0" }}>Nível: {certResult.certificate.signatureLevel}</p>
            </div>
          )}

          {govbrResult?.govbr && (
            <div style={{ textAlign: "left", marginTop: 16, padding: 12, background: "#eef2ff", borderRadius: 8, fontSize: "0.85rem" }}>
              <strong>🏛️ Gov.br</strong>
              <p style={{ margin: "4px 0" }}>Nome: {govbrResult.govbr.name}</p>
              <p style={{ margin: "4px 0" }}>CPF: {govbrResult.govbr.cpf}</p>
              <p style={{ margin: "4px 0" }}>Nível: {govbrResult.govbr.nivel}</p>
              <p style={{ margin: "4px 0" }}>Base legal: {govbrResult.govbr.legalBasis}</p>
            </div>
          )}

          <div style={{ marginTop: 20 }}>
            <button className="btn btn-primary" onClick={handleDownload} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              📥 Baixar documento assinado
            </button>
          </div>

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
        <p className="text-sm text-muted" style={{ marginBottom: 16 }}>Escolha como deseja assinar o documento:</p>

        {error && <div className="alert alert-error">{error}</div>}

        {formFields.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <PdfFormFieldsEditor
              fields={formFields}
              values={formValues}
              onChange={setFormValues}
            />
          </div>
        )}

        {/* Method tabs */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 20 }}>
          <button
            className={`btn ${signMethod === "draw" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setSignMethod("draw")}
            style={{ fontSize: "0.85rem" }}
          >
            ✏️ Desenhar
          </button>
          <button
            className={`btn ${signMethod === "type" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setSignMethod("type")}
            style={{ fontSize: "0.85rem" }}
          >
            ⌨️ Digitar
          </button>
          <button
            className={`btn ${signMethod === "certificate" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setSignMethod("certificate")}
            style={{ fontSize: "0.85rem" }}
          >
            🔐 Certificado ICP-Brasil
          </button>
          <button
            className={`btn ${signMethod === "govbr" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setSignMethod("govbr")}
            style={{ fontSize: "0.85rem" }}
          >
            🏛️ Gov.br
          </button>
        </div>

        {/* ── Draw ─────────────────────────────────────── */}
        {signMethod === "draw" && (
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
            <div className="mt-24">
              <button
                className="btn btn-primary"
                style={{ width: "100%", padding: "14px" }}
                onClick={handleSign}
                disabled={signing}
              >
                {signing ? "Assinando…" : "Confirmar assinatura"}
              </button>
            </div>
          </>
        )}

        {/* ── Type ─────────────────────────────────────── */}
        {signMethod === "type" && (
          <>
            <div className="form-group">
              <label>Nome completo</label>
              <input
                value={typedName}
                onChange={(e) => setTypedName(e.target.value)}
                placeholder={info.recipientName}
                style={{ fontFamily: "'Brush Script MT', cursive", fontSize: "1.5rem" }}
              />
            </div>
            <div className="mt-24">
              <button
                className="btn btn-primary"
                style={{ width: "100%", padding: "14px" }}
                onClick={handleSign}
                disabled={signing}
              >
                {signing ? "Assinando…" : "Confirmar assinatura"}
              </button>
            </div>
          </>
        )}

        {/* ── Certificate ICP-Brasil ───────────────────── */}
        {signMethod === "certificate" && (
          <CertificateUpload
            onCertificateReady={handleCertificateSign}
            onCancel={() => setSignMethod("draw")}
            loading={signing}
          />
        )}

        {/* ── Gov.br ───────────────────────────────────── */}
        {signMethod === "govbr" && (
          <GovBrSign
            onGovBrReady={handleGovBrSign}
            onCancel={() => setSignMethod("draw")}
            loading={signing}
          />
        )}

        {(signMethod === "draw" || signMethod === "type") && (
          <p className="text-sm text-muted text-center mt-16">
            Ao assinar, você concorda que esta assinatura eletrônica tem validade legal
            nos termos da Lei 14.063/2020.
          </p>
        )}
      </div>
    </main>
  );
}

function normalizeFormValues(values?: Record<string, string | boolean | string[]>) {
  const source = values ?? {};
  return Object.fromEntries(
    Object.entries(source).filter(([, value]) => {
      if (typeof value === "string") return value.trim().length > 0;
      if (Array.isArray(value)) return value.length > 0;
      return true;
    })
  );
}
