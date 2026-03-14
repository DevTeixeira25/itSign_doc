"use client";

import { useAuth } from "../../lib/auth-context";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { api } from "../../lib/api";
import { loadPdfDocument, renderPdfPage } from "../../lib/pdf";
import Link from "next/link";
import SignaturePad from "../../components/SignaturePad";
import CertificateUpload from "../../components/CertificateUpload";
import GovBrSign from "../../components/GovBrSign";
import PdfFormFieldsEditor, { type PdfFormFieldDefinition } from "../../components/PdfFormFieldsEditor";

type Step = "upload" | "place" | "fill" | "sign" | "done";
type SignMethod = "electronic" | "certificate" | "govbr";
type FillTool = "signature" | "text" | "check" | "cross" | "dot";
type OverlayField = {
  id: string;
  type: "text" | "check" | "cross" | "dot";
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  value?: string;
};

export default function SelfSignPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [step, setStep] = useState<Step>("upload");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // PDF rendering
  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);

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
  const [draggingFieldId, setDraggingFieldId] = useState<string | null>(null);
  const [resizeFieldId, setResizeFieldId] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<FillTool>("signature");
  const [overlayFields, setOverlayFields] = useState<OverlayField[]>([]);
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null);

  // Signature data
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [showSigPad, setShowSigPad] = useState(false);
  const [showCertModal, setShowCertModal] = useState(false);
  const [showGovbrModal, setShowGovbrModal] = useState(false);
  const [savedDocId, setSavedDocId] = useState<string | null>(null);
  const [preparedDocId, setPreparedDocId] = useState<string | null>(null);
  const [savedEnvelopeId, setSavedEnvelopeId] = useState<string | null>(null);
  const [verificationCode, setVerificationCode] = useState<string | null>(null);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [signMethod, setSignMethod] = useState<SignMethod>("electronic");
  const [certSignResult, setCertSignResult] = useState<any>(null);
  const [govbrResult, setGovbrResult] = useState<any>(null);
  const [signingMessage, setSigningMessage] = useState<string | null>(null);
  const [formFields, setFormFields] = useState<PdfFormFieldDefinition[]>([]);
  const [formValues, setFormValues] = useState<Record<string, string | boolean | string[]>>({});
  const [preparingDocument, setPreparingDocument] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [authLoading, user, router]);

  // ── Handle Gov.br callback return ──────────────────────────
  // After Gov.br OAuth, the user is redirected back here with ?govbr_session=xxx
  useEffect(() => {
    const govbrSessionId = searchParams.get("govbr_session");
    if (!govbrSessionId || !user) return;

    // Recover envelope data stored before the redirect
    const storedRecipientToken = sessionStorage.getItem("govbr_recipient_token");
    const storedEnvelopeId = sessionStorage.getItem("govbr_envelope_id");
    const storedDocId = sessionStorage.getItem("govbr_doc_id");
    const storedPosition = sessionStorage.getItem("govbr_sig_position");
    const storedFormValues = sessionStorage.getItem("govbr_form_values");
    const storedOverlayFields = sessionStorage.getItem("govbr_overlay_fields");
    const parsedPosition = storedPosition ? JSON.parse(storedPosition) : undefined;
    const parsedFormValues = storedFormValues ? JSON.parse(storedFormValues) : undefined;
    const parsedOverlayFields = storedOverlayFields ? JSON.parse(storedOverlayFields) : undefined;

    if (!storedRecipientToken) {
      setError("Dados da sessão Gov.br perdidos. Tente novamente.");
      return;
    }

    // Complete the signing using the Gov.br session
    (async () => {
      setLoading(true);
      setSigningMessage("Assinando documento com identidade Gov.br…");
      try {
        const result = await api.govbrSign(
          govbrSessionId,
          storedRecipientToken,
          parsedPosition,
          parsedFormValues,
          parsedOverlayFields
        );
        setGovbrResult(result);

        if (storedDocId) setSavedDocId(storedDocId);
        if (storedEnvelopeId) setSavedEnvelopeId(storedEnvelopeId);

        // Send envelope
        if (storedEnvelopeId) {
          try { await api.sendEnvelope(storedEnvelopeId); } catch { /* already completed */ }
        }

        // Get verification code
        if (result.verificationCode) {
          setVerificationCode(result.verificationCode);
        } else if (storedEnvelopeId) {
          try {
            const verif = await api.getEnvelopeVerification(storedEnvelopeId);
            setVerificationCode(verif.verificationCode);
          } catch { /* may not be ready */ }
        }

        setSignMethod("govbr");
        setStep("done");

        // Clean up sessionStorage
        sessionStorage.removeItem("govbr_recipient_token");
        sessionStorage.removeItem("govbr_envelope_id");
        sessionStorage.removeItem("govbr_doc_id");
        sessionStorage.removeItem("govbr_sig_position");
        sessionStorage.removeItem("govbr_form_values");
        sessionStorage.removeItem("govbr_overlay_fields");

        // Remove the query param from the URL
        router.replace("/self-sign");
      } catch (err: any) {
        setError(err.message ?? "Erro ao assinar com Gov.br");
      } finally {
        setLoading(false);
        setSigningMessage(null);
      }
    })();
  }, [searchParams, user]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Render all pages — re-runs when step changes so canvases are in the DOM
  useEffect(() => {
    if (!pdfDoc) return;
    const timer = setTimeout(async () => {
      try {
        await Promise.all(
          Array.from({ length: numPages }, (_, index) => {
            const pageNumber = index + 1;
            const canvas = canvasRefs.current.get(pageNumber);
            if (!canvas) return Promise.resolve();
            return renderPdfPage(pdfDoc, pageNumber, canvas, 1.5);
          })
        );
      } catch (err) {
        console.error("PDF render error:", err);
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [pdfDoc, numPages, step]);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      setTitle(f.name.replace(/\.[^.]+$/, ""));
      setPreparedDocId(null);
      setFormFields([]);
      setFormValues({});
      setSigField(null);
      setOverlayFields([]);
      setSelectedOverlayId(null);
      setResizeFieldId(null);
    }
  }

  async function goToPlaceStep() {
    if (!file) {
      setError("Selecione um arquivo PDF");
      return;
    }
    if (!title.trim()) {
      setError("Informe um título para o documento");
      return;
    }
    setError("");
    setPreparingDocument(true);
    try {
      const doc = preparedDocId ? { id: preparedDocId } : await api.uploadDocument(file);
      const nextDocId = doc.id as string;
      setPreparedDocId(nextDocId);
      setSavedDocId(nextDocId);
      const formResult = await api.getDocumentFormFields(nextDocId);
      const fields = (formResult.data ?? []) as PdfFormFieldDefinition[];
      setFormFields(fields);
      setFormValues(Object.fromEntries(fields.flatMap((field) => field.value != null ? [[field.name, field.value]] : [])));
      setStep("place");
    } catch (err: any) {
      setError(err?.message ?? "Não foi possível preparar o documento.");
    } finally {
      setPreparingDocument(false);
    }
  }

  // Place fill/sign fields by clicking on PDF
  function handlePdfClick(page: number, e: React.MouseEvent<HTMLDivElement>) {
    setCurrentPage(page);
    if (step !== "place") return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    if (activeTool === "signature") {
      setSigField({
        page,
        x: Math.max(0, Math.min(x - 12.5, 75)),
        y: Math.max(0, Math.min(y - 4, 92)),
        width: 25,
        height: 8,
      });
      return;
    }

    const nextField = createOverlayField(activeTool, page, x, y);
    setOverlayFields((current) => [...current, nextField]);
    setSelectedOverlayId(nextField.id);
  }

  // Drag to reposition
  function handleFieldMouseDown(e: React.MouseEvent, fieldId: string) {
    e.stopPropagation();
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
    setDraggingFieldId(fieldId);
  }

  function handleFieldMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!isDragging || !dragStart) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const dx = ((e.clientX - dragStart.x) / rect.width) * 100;
    const dy = ((e.clientY - dragStart.y) / rect.height) * 100;
    if (resizeFieldId === "signature") {
      if (!sigField) return;
      setSigField({
        ...sigField,
        width: clamp(sigField.width + dx, 8, 60),
        height: clamp(sigField.height + dy, 3, 25),
      });
    } else if (resizeFieldId) {
      setOverlayFields((current) => current.map((field) => {
        if (field.id !== resizeFieldId) return field;
        return {
          ...field,
          width: clamp(field.width + dx, field.type === "text" ? 8 : 2.5, field.type === "text" ? 60 : 18),
          height: clamp(field.height + dy, field.type === "text" ? 3 : 2.5, field.type === "text" ? 20 : 18),
        };
      }));
    } else if (draggingFieldId === "signature") {
      if (!sigField) return;
      setSigField({
        ...sigField,
        x: Math.max(0, Math.min(sigField.x + dx, 100 - sigField.width)),
        y: Math.max(0, Math.min(sigField.y + dy, 100 - sigField.height)),
      });
    } else if (draggingFieldId) {
      setOverlayFields((current) => current.map((field) => {
        if (field.id !== draggingFieldId) return field;
        return {
          ...field,
          x: Math.max(0, Math.min(field.x + dx, 100 - field.width)),
          y: Math.max(0, Math.min(field.y + dy, 100 - field.height)),
        };
      }));
    }
    setDragStart({ x: e.clientX, y: e.clientY });
  }

  function handleFieldMouseUp() {
    setIsDragging(false);
    setDragStart(null);
    setDraggingFieldId(null);
    setResizeFieldId(null);
  }

  function updateOverlayField(id: string, patch: Partial<OverlayField>) {
    setOverlayFields((current) => current.map((field) => field.id === id ? { ...field, ...patch } : field));
  }

  function removeOverlayField(id: string) {
    setOverlayFields((current) => current.filter((field) => field.id !== id));
    setSelectedOverlayId((current) => current === id ? null : current);
  }

  function updateSelectedSize(dimension: "width" | "height", value: number) {
    if (selectedOverlayId) {
      updateOverlayField(selectedOverlayId, { [dimension]: value } as Partial<OverlayField>);
      return;
    }
    if (sigField) {
      setSigField({ ...sigField, [dimension]: value });
    }
  }

  function selectedFieldConfig() {
    if (selectedOverlayId) {
      return overlayFields.find((field) => field.id === selectedOverlayId) ?? null;
    }
    return sigField ? { ...sigField, id: "signature", type: "signature" as const } : null;
  }

  function confirmPlacement() {
    if (!sigField) {
      setError("Clique no documento para posicionar o campo de assinatura");
      return;
    }
    setError("");
    if (hasManualTextFields(overlayFields)) {
      setStep("fill");
      return;
    }
    setStep("sign");
    setShowSigPad(true);
  }

  function goToSigningStep() {
    setError("");
    setStep("sign");
    if (signMethod === "electronic" && !signatureDataUrl) {
      setShowSigPad(true);
    }
  }

  function handleSignatureSaved(dataUrl: string) {
    setSignatureDataUrl(dataUrl);
    setShowSigPad(false);
  }

  async function handleSave() {
    if (!file || !signatureDataUrl) {
      setError("Dados da assinatura incompletos. Refaça a assinatura.");
      return;
    }
    if (!areManualTextFieldsFilled(overlayFields)) {
      setError("Preencha todos os campos de texto adicionados antes de assinar.");
      return;
    }
    if (!sigField) {
      setError("Posicione o campo de assinatura no documento primeiro.");
      return;
    }
    setError("");
    setLoading(true);
    setSigningMessage("Assinando documento eletronicamente...");
    try {
      // 1) Upload document
      const documentId = preparedDocId ?? (await api.uploadDocument(file)).id;
      setSavedDocId(documentId);

      // 2) Create a self-sign envelope
      const envelope = await api.createEnvelope({
        title,
        documentId,
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
        signaturePosition: sigField ?? undefined,
        formFields: normalizeFormValues(formValues),
        overlayFields,
      });

      // 5) Send envelope (marks as sent then auto-completes)
      try {
        await api.sendEnvelope(envelope.id);
      } catch {
        // Already completed since single signer
      }

      // 6) Get verification code
      try {
        const verif = await api.getEnvelopeVerification(envelope.id);
        setVerificationCode(verif.verificationCode);
      } catch {
        // Certificate may not be ready yet
      }

      setSavedEnvelopeId(envelope.id);
      setStep("done");
    } catch (err: any) {
      setError(typeof err === "object" && err.message ? err.message : "Erro ao salvar documento assinado");
    } finally {
      setLoading(false);
      setSigningMessage(null);
    }
  }

  async function handleCertificateSign(certFile: File, certPassword: string) {
    if (!file) return;
    if (!areManualTextFieldsFilled(overlayFields)) {
      setError("Preencha todos os campos de texto adicionados antes de assinar.");
      return;
    }
    setError("");
    setLoading(true);
    setSigningMessage("Assinando com Certificado Digital...");
    try {
      // 1) Upload document
      const documentId = preparedDocId ?? (await api.uploadDocument(file)).id;
      setSavedDocId(documentId);

      // 2) Create a self-sign envelope
      const envelope = await api.createEnvelope({
        title,
        documentId,
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

      // 4) Sign with ICP-Brasil certificate
      const result = await api.signWithCertificate({
        certificateFile: certFile,
        password: certPassword,
        recipientToken,
        envelopeId: envelope.id,
        signaturePosition: sigField ?? undefined,
        formFields: normalizeFormValues(formValues),
        overlayFields,
      });

      setCertSignResult(result);

      // 5) Send envelope
      try {
        await api.sendEnvelope(envelope.id);
      } catch {
        // Already completed
      }

      // 6) Get verification code
      if (result.verificationCode) {
        setVerificationCode(result.verificationCode);
      } else {
        try {
          const verif = await api.getEnvelopeVerification(envelope.id);
          setVerificationCode(verif.verificationCode);
        } catch {
          // May not be ready
        }
      }

      setSavedEnvelopeId(envelope.id);
      setStep("done");
    } catch (err: any) {
      setError(typeof err === "object" && err.message ? err.message : "Erro ao assinar com certificado");
    } finally {
      setLoading(false);
      setSigningMessage(null);
    }
  }

  async function handleGovBrSign() {
    if (!file) return;
    if (!areManualTextFieldsFilled(overlayFields)) {
      setError("Preencha todos os campos de texto adicionados antes de assinar.");
      return;
    }
    setError("");
    setLoading(true);
    setSigningMessage("Preparando documento para assinatura Gov.br…");
    try {
      // 1) Upload document
      const documentId = preparedDocId ?? (await api.uploadDocument(file)).id;
      setSavedDocId(documentId);

      // 2) Create a self-sign envelope
      const envelope = await api.createEnvelope({
        title,
        documentId,
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

      // 4) Store data in sessionStorage so we can recover after the redirect
      sessionStorage.setItem("govbr_recipient_token", recipientToken);
      sessionStorage.setItem("govbr_envelope_id", envelope.id);
      sessionStorage.setItem("govbr_doc_id", documentId);
      if (sigField) {
        sessionStorage.setItem("govbr_sig_position", JSON.stringify(sigField));
      }
      sessionStorage.setItem("govbr_form_values", JSON.stringify(normalizeFormValues(formValues)));
      sessionStorage.setItem("govbr_overlay_fields", JSON.stringify(overlayFields));

      // 5) Start the real Gov.br OAuth2 flow
      const { authUrl } = await api.govbrAuthorize({
        recipientToken,
        returnPath: "/self-sign",
      });

      // 6) Redirect to Gov.br login page
      //    After authentication, Gov.br will redirect to our callback,
      //    which will redirect back to /self-sign?govbr_session=xxx
      setSigningMessage("Redirecionando para Gov.br…");
      window.location.href = authUrl;
    } catch (err: any) {
      setError(typeof err === "object" && err.message ? err.message : "Erro ao iniciar assinatura Gov.br");
      setLoading(false);
      setSigningMessage(null);
    }
  }

  async function handleDownload() {
    if (!savedDocId) return;
    try {
      const { blob, fileName } = await api.downloadDocument(savedDocId);
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

  if (authLoading || !user) return null;

  function scrollToPage(page: number) {
    const nextPage = clamp(Math.round(page), 1, Math.max(1, numPages));
    setCurrentPage(nextPage);
    pageRefs.current.get(nextPage)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderPageNavigation() {
    if (numPages <= 1) return null;
    return (
      <div className="pdf-toolbar">
        <button className="btn btn-secondary btn-sm" disabled={currentPage <= 1} onClick={() => scrollToPage(currentPage - 1)}>
          ←
        </button>
        <span className="text-sm">Página {currentPage} de {numPages}</span>
        <button className="btn btn-secondary btn-sm" disabled={currentPage >= numPages} onClick={() => scrollToPage(currentPage + 1)}>
          →
        </button>
      </div>
    );
  }

  function renderSignatureOverlay(pageNumber: number, signed = false) {
    if (!sigField || sigField.page !== pageNumber) return null;

    return (
      <div
        className={`sig-field-overlay${signed ? " signed" : ""}`}
        style={{
          left: `${sigField.x}%`,
          top: `${sigField.y}%`,
          width: `${sigField.width}%`,
          height: `${sigField.height}%`,
        }}
        onMouseDown={(e) => {
          setCurrentPage(pageNumber);
          handleFieldMouseDown(e, "signature");
        }}
        onClick={(e) => {
          e.stopPropagation();
          setCurrentPage(pageNumber);
          setSelectedOverlayId(null);
        }}
      >
        {signed && signatureDataUrl ? (
          <img src={signatureDataUrl} alt="Assinatura" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
        ) : (
          <span className="sig-field-label">✍️ Assinatura</span>
        )}
        <button
          type="button"
          className="field-resize-handle"
          onMouseDown={(e) => {
            e.stopPropagation();
            setCurrentPage(pageNumber);
            setIsDragging(true);
            setDragStart({ x: e.clientX, y: e.clientY });
            setResizeFieldId("signature");
          }}
        />
      </div>
    );
  }

  function renderOverlaysForPage(pageNumber: number, mode: "place" | "fill" | "sign") {
    return overlayFields.filter((field) => field.page === pageNumber).map((field) => (
      <div
        key={field.id}
        className={`pdf-field pdf-field-${field.type}${mode !== "place" || selectedOverlayId === field.id ? " pdf-field-filled" : ""}`}
        style={{
          left: `${field.x}%`,
          top: `${field.y}%`,
          width: `${field.width}%`,
          height: `${field.height}%`,
          cursor: "move",
        }}
        onClick={(e) => {
          e.stopPropagation();
          setCurrentPage(pageNumber);
          setSelectedOverlayId(field.id);
        }}
        onMouseDown={(e) => {
          setCurrentPage(pageNumber);
          handleFieldMouseDown(e, field.id);
        }}
      >
        {mode === "fill" && field.type === "text" ? (
          <input
            className="pdf-inline-input"
            value={field.value ?? ""}
            onChange={(e) => updateOverlayField(field.id, { value: e.target.value })}
            placeholder="Digite aqui"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="pdf-field-label">
            {field.type === "text" ? (field.value?.trim() || "Texto") : field.type === "check" ? "✓" : field.type === "cross" ? "X" : "•"}
          </span>
        )}
        <button
          type="button"
          className="field-resize-handle"
          onMouseDown={(e) => {
            e.stopPropagation();
            setCurrentPage(pageNumber);
            setSelectedOverlayId(field.id);
            setIsDragging(true);
            setDragStart({ x: e.clientX, y: e.clientY });
            setResizeFieldId(field.id);
          }}
        />
      </div>
    ));
  }

  function renderPdfPages(mode: "place" | "fill" | "sign") {
    return (
      <>
        {renderPageNavigation()}
        <div className="pdf-pages-stack">
          {Array.from({ length: numPages }, (_, index) => {
            const pageNumber = index + 1;
            return (
              <div
                key={pageNumber}
                ref={(node) => {
                  if (node) pageRefs.current.set(pageNumber, node);
                  else pageRefs.current.delete(pageNumber);
                }}
                className={`pdf-page-shell${currentPage === pageNumber ? " active" : ""}`}
              >
                <div className="pdf-page-badge">Página {pageNumber}</div>
                <div
                  className="pdf-page-container active"
                  style={{ position: "relative", cursor: mode === "place" ? "crosshair" : "default" }}
                  onClick={(e) => handlePdfClick(pageNumber, e)}
                  onMouseMove={handleFieldMouseMove}
                  onMouseUp={handleFieldMouseUp}
                  onMouseLeave={handleFieldMouseUp}
                >
                  <canvas
                    ref={(node) => {
                      if (node) canvasRefs.current.set(pageNumber, node);
                      else canvasRefs.current.delete(pageNumber);
                    }}
                  />
                  {renderSignatureOverlay(pageNumber, mode === "sign")}
                  {renderOverlaysForPage(pageNumber, mode)}
                </div>
              </div>
            );
          })}
        </div>
      </>
    );
  }

  return (
    <>
      {/* Full-page loading overlay for signing operations */}
      {signingMessage && (
        <div style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.6)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 200,
          gap: 16,
        }}>
          <div style={{
            background: "#fff",
            borderRadius: 16,
            padding: "40px 48px",
            textAlign: "center",
            boxShadow: "0 8px 40px rgba(0,0,0,0.3)",
            maxWidth: 400,
          }}>
            <div className="loader" style={{ margin: "0 auto 16px" }} />
            <p style={{ fontSize: "1.1rem", fontWeight: 600, margin: "0 0 8px" }}>{signingMessage}</p>
            <p className="text-sm text-muted" style={{ margin: 0 }}>Aguarde, não feche esta página...</p>
          </div>
        </div>
      )}

      <header className="topbar">
        <h1>ITSign</h1>
        <nav>
          <Link href="/dashboard">Dashboard</Link>
        </nav>
      </header>

      <main className="container" style={{ maxWidth: step === "upload" ? 640 : 1100 }}>
        {/* Progress steps */}
        <div className="step-progress">
          <div className={`step-item ${step === "upload" ? "active" : ["place", "fill", "sign", "done"].includes(step) ? "completed" : ""}`}>
            <span className="step-num">1</span>
            <span className="step-label">Documento</span>
          </div>
          <div className="step-line" />
          <div className={`step-item ${step === "place" ? "active" : ["fill", "sign", "done"].includes(step) ? "completed" : ""}`}>
            <span className="step-num">2</span>
            <span className="step-label">Posicionar campo</span>
          </div>
          <div className="step-line" />
          <div className={`step-item ${step === "fill" ? "active" : ["sign", "done"].includes(step) ? "completed" : ""}`}>
            <span className="step-num">3</span>
            <span className="step-label">Preencher</span>
          </div>
          <div className="step-line" />
          <div className={`step-item ${step === "sign" ? "active" : step === "done" ? "completed" : ""}`}>
            <span className="step-num">4</span>
            <span className="step-label">Assinar</span>
          </div>
          <div className="step-line" />
          <div className={`step-item ${step === "done" ? "active" : ""}`}>
            <span className="step-num">5</span>
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
              {preparingDocument ? "Preparando documento..." : "Continuar →"}
            </button>
          </div>
        )}

        {/* ── STEP 2: Place fill/sign fields ── */}
        {step === "place" && (
          <div className="self-sign-layout">
            <div className="self-sign-sidebar">
              <div className="card">
                <h2>Ferramentas de preenchimento</h2>
                <p className="text-sm text-muted fill-toolbar-copy">
                  Selecione uma ferramenta e clique no PDF para inserir.
                </p>
                <div className="fill-tool-grid">
                  {[
                    { id: "text", icon: "A", title: "Texto" },
                    { id: "signature", icon: "✍", title: "Assinar" },
                    { id: "check", icon: "✓", title: "Visto" },
                    { id: "cross", icon: "X", title: "X" },
                    { id: "dot", icon: "•", title: "Ponto" },
                  ].map((tool) => (
                    <button
                      key={tool.id}
                      className={`fill-tool-button ${activeTool === tool.id ? "active" : ""}`}
                      onClick={() => setActiveTool(tool.id as FillTool)}
                      title={tool.title}
                    >
                      <span className="fill-tool-icon">{tool.icon}</span>
                    </button>
                  ))}
                </div>
                <div className="fill-tool-hint">
                  Clique para inserir. Arraste para mover. Redimensione pelo canto.
                </div>
                <div className="fill-step-actions">
                  <button
                    className="btn btn-primary"
                    style={{ width: "100%" }}
                    disabled={!sigField}
                    onClick={confirmPlacement}
                  >
                    Próximo: conferir e assinar →
                  </button>
                  <button
                    className="btn btn-secondary"
                    style={{ width: "100%" }}
                    onClick={() => { setStep("upload"); setSigField(null); setOverlayFields([]); setSelectedOverlayId(null); }}
                  >
                    ← Voltar ao upload
                  </button>
                </div>
                <div className="fill-status-row">
                  {formFields.length > 0 && (
                    <span className="fill-status-pill ok">{formFields.length} campo(s) detectado(s)</span>
                  )}
                  <span className={`fill-status-pill ${sigField ? "ok" : "warn"}`}>
                    {sigField ? `Assinatura na pág. ${sigField.page}` : "Posicione a assinatura"}
                  </span>
                  {overlayFields.length > 0 && (
                    <span className="fill-status-pill neutral">{overlayFields.length} marcação(ões)</span>
                  )}
                </div>
                <div className="fill-items-card">
                  <div className="fill-items-head">
                    <strong>Itens inseridos</strong>
                    <span>{overlayFields.length + (sigField ? 1 : 0)}</span>
                  </div>
                  <div className="fill-items-list">
                    {sigField && (
                      <button
                        type="button"
                        className={`fill-item-row ${selectedOverlayId == null ? "active" : ""}`}
                        onClick={() => {
                          setSelectedOverlayId(null);
                          scrollToPage(sigField.page);
                        }}
                      >
                        <span className="fill-item-icon">✍</span>
                        <span className="fill-item-copy">Assinatura</span>
                        <span className="fill-item-meta">Pág. {sigField.page}</span>
                      </button>
                    )}
                    {overlayFields.map((field, index) => (
                      <button
                        key={field.id}
                        type="button"
                        className={`fill-item-row ${selectedOverlayId === field.id ? "active" : ""}`}
                        onClick={() => {
                          setSelectedOverlayId(field.id);
                          scrollToPage(field.page);
                        }}
                      >
                        <span className="fill-item-icon">
                          {field.type === "text" ? "A" : field.type === "check" ? "✓" : field.type === "cross" ? "X" : "•"}
                        </span>
                        <span className="fill-item-copy">
                          {field.type === "text"
                            ? field.value?.trim() || `Texto ${index + 1}`
                            : field.type === "check"
                              ? `Visto ${index + 1}`
                              : field.type === "cross"
                                ? `X ${index + 1}`
                                : `Ponto ${index + 1}`}
                        </span>
                        <span className="fill-item-meta">Pág. {field.page}</span>
                      </button>
                    ))}
                    {!sigField && overlayFields.length === 0 && (
                      <div className="fill-items-empty">Nenhum item inserido ainda.</div>
                    )}
                  </div>
                </div>
                {selectedOverlayId && overlayFields.find((field) => field.id === selectedOverlayId)?.type === "text" && (
                  <div className="form-group" style={{ marginTop: 12 }}>
                    <label>Texto do campo selecionado</label>
                    <input
                      value={overlayFields.find((field) => field.id === selectedOverlayId)?.value ?? ""}
                      onChange={(e) => updateOverlayField(selectedOverlayId, { value: e.target.value })}
                      placeholder="Digite o conteúdo"
                    />
                  </div>
                )}
                {selectedFieldConfig() && (
                  <div className="fill-inspector">
                    <div className="fill-inspector-head">
                      <strong>Item selecionado</strong>
                      <span>
                        {selectedOverlayId
                          ? overlayFields.find((field) => field.id === selectedOverlayId)?.type ?? "campo"
                          : "signature"}
                      </span>
                    </div>
                    <div className="fill-size-grid">
                      <label>
                        <span>Largura</span>
                        <input
                          type="range"
                          min={selectedOverlayId ? 3 : 8}
                          max={selectedOverlayId ? 60 : 60}
                          step="0.5"
                          value={selectedFieldConfig()?.width ?? 10}
                          onChange={(e) => updateSelectedSize("width", Number(e.target.value))}
                        />
                      </label>
                      <label>
                        <span>Altura</span>
                        <input
                          type="range"
                          min={selectedOverlayId ? 2.5 : 3}
                          max={selectedOverlayId ? 20 : 25}
                          step="0.5"
                          value={selectedFieldConfig()?.height ?? 5}
                          onChange={(e) => updateSelectedSize("height", Number(e.target.value))}
                        />
                      </label>
                    </div>
                  </div>
                )}
                {selectedOverlayId && (
                  <button
                    className="btn btn-secondary"
                    style={{ width: "100%", marginBottom: 12 }}
                    onClick={() => removeOverlayField(selectedOverlayId)}
                  >
                    Remover marcação selecionada
                  </button>
                )}
              </div>
            </div>

            <div className="self-sign-pdf">
              {!pdfDoc ? (
                <div className="pdf-loading">
                  <div className="loader" />
                  <p>Carregando PDF…</p>
                </div>
              ) : (
                renderPdfPages("place")
              )}
            </div>
          </div>
        )}

        {/* ── STEP 3: Fill text fields ── */}
        {step === "fill" && (
          <div className="self-sign-layout">
            <div className="self-sign-sidebar">
              <div className="card">
                <h2>Preencher campos</h2>
                <p className="text-sm text-muted">
                  Preencha os campos diretamente sobre o PDF. Você só pode seguir quando todos os campos de texto adicionados estiverem preenchidos.
                </p>
                <div className="fill-status-row">
                  <span className="fill-status-pill neutral">
                    {overlayFields.filter((field) => field.type === "text").length} campo(s) de texto
                  </span>
                  <span className={`fill-status-pill ${areManualTextFieldsFilled(overlayFields) ? "ok" : "warn"}`}>
                    {areManualTextFieldsFilled(overlayFields) ? "Tudo preenchido" : "Há campos pendentes"}
                  </span>
                </div>
                <div className="fill-step-actions">
                  <button
                    className="btn btn-primary"
                    style={{ width: "100%" }}
                    onClick={goToSigningStep}
                    disabled={!areManualTextFieldsFilled(overlayFields)}
                  >
                    Próximo: assinar →
                  </button>
                  <button
                    className="btn btn-secondary"
                    style={{ width: "100%" }}
                    onClick={() => setStep("place")}
                  >
                    ← Voltar ao posicionamento
                  </button>
                </div>
              </div>
            </div>

            <div className="self-sign-pdf">
              {renderPdfPages("fill")}
            </div>
          </div>
        )}

        {/* ── STEP 4: Sign ── */}
        {step === "sign" && (
          <div className="self-sign-layout">
            <div className="self-sign-sidebar">
              <div className="card">
                <h2>Método de assinatura</h2>

                {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}

                {formFields.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <PdfFormFieldsEditor
                      fields={formFields}
                      values={formValues}
                      onChange={setFormValues}
                    />
                  </div>
                )}

                <div className="form-group" style={{ marginBottom: 16 }}>
                  <label>Modelo de assinatura</label>
                  <select
                    value={signMethod}
                    onChange={(e) => {
                      const next = e.target.value as SignMethod;
                      setSignMethod(next);
                      if (next === "certificate") setShowCertModal(true);
                      if (next === "govbr") setShowGovbrModal(true);
                    }}
                  >
                    <option value="electronic">Eletrônica</option>
                    <option value="certificate">Certificado Digital</option>
                    <option value="govbr">Gov.br</option>
                  </select>
                </div>

                {/* Electronic signature flow */}
                {signMethod === "electronic" && (
                  <>
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

                        {/* Legal terms acceptance */}
                        <div style={{
                          background: "#eff6ff",
                          border: "1px solid #bfdbfe",
                          borderRadius: 8,
                          padding: 12,
                          marginTop: 16,
                          fontSize: "0.8rem",
                          color: "#1e40af",
                        }}>
                          <label style={{ display: "flex", gap: 8, cursor: "pointer", alignItems: "flex-start" }}>
                            <input
                              type="checkbox"
                              checked={acceptedTerms}
                              onChange={(e) => setAcceptedTerms(e.target.checked)}
                              style={{ marginTop: 2 }}
                            />
                            <span>
                              Declaro que li e concordo em assinar eletronicamente este documento,
                              nos termos da <strong>Lei 14.063/2020</strong> e <strong>MP 2.200-2/2001</strong>.
                              Esta assinatura eletrônica tem validade jurídica equivalente à assinatura manuscrita.
                            </span>
                          </label>
                        </div>

                        <button
                          className="btn btn-primary mt-16"
                          style={{ width: "100%", padding: "14px" }}
                          onClick={handleSave}
                          disabled={loading || !acceptedTerms}
                        >
                          {loading ? "Salvando…" : "💾 Salvar documento assinado"}
                        </button>
                      </>
                    )}
                  </>
                )}

                {/* ICP-Brasil certificate flow */}
                {signMethod === "certificate" && !showCertModal && (
                  <div style={{ textAlign: "center", padding: "12px 0" }}>
                    <p className="text-sm text-muted">Certificado Digital selecionado.</p>
                    <button
                      className="btn btn-primary"
                      style={{ width: "100%" }}
                      onClick={() => setShowCertModal(true)}
                    >
                      🔐 Abrir formulário do certificado
                    </button>
                  </div>
                )}

                {/* Gov.br signing flow */}
                {signMethod === "govbr" && !showGovbrModal && (
                  <div style={{ textAlign: "center", padding: "12px 0" }}>
                    <p className="text-sm text-muted">Assinatura Gov.br selecionada.</p>
                    <button
                      className="btn btn-primary"
                      style={{ width: "100%", background: "#1351B4" }}
                      onClick={() => setShowGovbrModal(true)}
                    >
                      🏛️ Iniciar assinatura Gov.br
                    </button>
                  </div>
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
              {renderPdfPages("sign")}
            </div>

            {/* Signature pad modal */}
            {showSigPad && (
              <div className="modal-overlay" onClick={() => setShowSigPad(false)}>
                <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                  <h2>Sua assinatura</h2>
                  <SignaturePad
                    onSave={handleSignatureSaved}
                    onCancel={() => setShowSigPad(false)}
                    onCertificateSign={() => { setShowSigPad(false); setShowCertModal(true); setSignMethod("certificate"); }}
                    onGovBrSign={() => { setShowSigPad(false); setShowGovbrModal(true); setSignMethod("govbr"); }}
                    width={500}
                    height={180}
                  />
                </div>
              </div>
            )}

            {/* Certificate modal */}
            {showCertModal && (
              <div className="modal-overlay" onClick={() => setShowCertModal(false)}>
                <div className="modal-content" style={{ maxWidth: 540 }} onClick={(e) => e.stopPropagation()}>
                  <CertificateUpload
                    onCertificateReady={(file, password) => { setShowCertModal(false); handleCertificateSign(file, password); }}
                    onCancel={() => { setShowCertModal(false); setSignMethod("electronic"); }}
                    loading={loading}
                  />
                </div>
              </div>
            )}

            {/* Gov.br modal */}
            {showGovbrModal && (
              <div className="modal-overlay" onClick={() => setShowGovbrModal(false)}>
                <div className="modal-content" style={{ maxWidth: 540 }} onClick={(e) => e.stopPropagation()}>
                  <GovBrSign
                    onGovBrReady={() => { setShowGovbrModal(false); handleGovBrSign(); }}
                    onCancel={() => { setShowGovbrModal(false); setSignMethod("electronic"); }}
                    loading={loading}
                    govbrResult={govbrResult?.govbr}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── STEP 4: Done ── */}
        {step === "done" && (
          <div className="card text-center" style={{ maxWidth: 640, margin: "0 auto" }}>
            <div style={{ fontSize: "3rem" }}>✅</div>
            <h2>Documento assinado com sucesso!</h2>
            <p className="text-muted">
              O documento <strong>{title}</strong> foi assinado e salvo.
            </p>

            {/* Verification code */}
            {verificationCode && (
              <div style={{
                background: "#f0fdf4",
                border: "2px solid #22c55e",
                borderRadius: 12,
                padding: "20px 24px",
                margin: "20px auto",
                maxWidth: 420,
              }}>
                <p style={{ margin: "0 0 4px", fontWeight: 600, color: "#166534", fontSize: "0.85rem" }}>
                  🔐 Código de Verificação
                </p>
                <p style={{
                  fontFamily: "monospace",
                  fontSize: "1.4rem",
                  fontWeight: 700,
                  letterSpacing: 2,
                  margin: "8px 0",
                  color: "#0f172a",
                }}>
                  {verificationCode}
                </p>
                <p style={{ margin: "0 0 12px", fontSize: "0.8rem", color: "#15803d" }}>
                  Guarde este código. Qualquer pessoa pode usá-lo para verificar a autenticidade deste documento.
                </p>
                <Link
                  href={`/verify/${verificationCode}`}
                  className="btn btn-secondary btn-sm"
                  style={{ fontSize: "0.85rem" }}
                >
                  🔍 Verificar agora
                </Link>
              </div>
            )}

            <div style={{
              background: "#eff6ff",
              border: "1px solid #bfdbfe",
              borderRadius: 8,
              padding: 12,
              margin: "16px auto",
              maxWidth: 420,
              fontSize: "0.8rem",
              color: "#1e40af",
              textAlign: "left",
            }}>
              <strong>⚖️ Validade jurídica:</strong>{" "}
              {certSignResult?.certificate?.isIcpBrasil ? (
                <>
                  Este documento foi assinado com <strong>certificado digital ICP-Brasil</strong> ({certSignResult.certificate.certType}),
                  constituindo <strong>assinatura eletrônica qualificada</strong> nos termos da Lei 14.063/2020, Art. 4°, III.
                  Possui presunção de veracidade e equivale à assinatura manuscrita (MP 2.200-2/2001, Art. 10, §1°).
                </>
              ) : govbrResult?.govbr ? (
                <>
                  Este documento foi assinado com <strong>identidade digital Gov.br</strong> (nível {govbrResult.govbr.nivel}),
                  constituindo <strong>assinatura eletrônica {govbrResult.govbr.signatureLevel}</strong> nos termos da
                  Lei 14.063/2020 e <strong>Decreto 10.543/2020</strong>.
                </>
              ) : (
                <>
                  Este documento foi assinado eletronicamente em conformidade com a
                  Lei 14.063/2020 e MP 2.200-2/2001. A integridade é garantida por hash SHA-256 e
                  prova criptográfica HMAC-SHA256 vinculando assinante, documento e timestamp.
                </>
              )}
            </div>

            {/* Gov.br identity info */}
            {govbrResult?.govbr && (
              <div style={{
                background: "#eef2ff",
                border: "1px solid #c7d2fe",
                borderRadius: 8,
                padding: 12,
                margin: "12px auto",
                maxWidth: 420,
                fontSize: "0.8rem",
                textAlign: "left",
              }}>
                <strong>🏛️ Assinatura Gov.br</strong>
                <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 12px" }}>
                  <span style={{ color: "#6b7280" }}>Nome:</span>
                  <span>{govbrResult.govbr.name}</span>
                  <span style={{ color: "#6b7280" }}>CPF:</span>
                  <span>{govbrResult.govbr.cpf?.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.***.***-$4")}</span>
                  <span style={{ color: "#6b7280" }}>Nível:</span>
                  <span className={`icp-badge ${
                    govbrResult.govbr.nivel === "ouro" ? "qualified" : "advanced"
                  }`}>
                    {govbrResult.govbr.nivel === "ouro" ? "Ouro" : govbrResult.govbr.nivel === "prata" ? "Prata" : "Bronze"}
                  </span>
                  <span style={{ color: "#6b7280" }}>Nível assinatura:</span>
                  <span className={`icp-badge ${
                    govbrResult.govbr.signatureLevel === "qualificada" ? "qualified" : "advanced"
                  }`}>
                    {govbrResult.govbr.signatureLevel === "qualificada" ? "Qualificada" : "Avançada"}
                  </span>
                </div>
              </div>
            )}

            {/* ICP-Brasil certificate info */}
            {certSignResult?.certificate && (
              <div style={{
                background: certSignResult.certificate.isIcpBrasil ? "#f0fdf4" : "#fefce8",
                border: `1px solid ${certSignResult.certificate.isIcpBrasil ? "#86efac" : "#fde68a"}`,
                borderRadius: 8,
                padding: 12,
                margin: "12px auto",
                maxWidth: 420,
                fontSize: "0.8rem",
                textAlign: "left",
              }}>
                <strong>
                  {certSignResult.certificate.isIcpBrasil ? "🏛️ Certificado ICP-Brasil" : "📜 Certificado Digital"}
                </strong>
                <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 12px" }}>
                  <span style={{ color: "#6b7280" }}>Titular:</span>
                  <span>{certSignResult.certificate.commonName}</span>
                  {certSignResult.certificate.cpf && (
                    <>
                      <span style={{ color: "#6b7280" }}>CPF:</span>
                      <span>{certSignResult.certificate.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.***.***-$4")}</span>
                    </>
                  )}
                  {certSignResult.certificate.cnpj && (
                    <>
                      <span style={{ color: "#6b7280" }}>CNPJ:</span>
                      <span>{certSignResult.certificate.cnpj}</span>
                    </>
                  )}
                  <span style={{ color: "#6b7280" }}>Emissor:</span>
                  <span>{certSignResult.certificate.issuer}</span>
                  <span style={{ color: "#6b7280" }}>Tipo:</span>
                  <span>{certSignResult.certificate.certType}</span>
                  <span style={{ color: "#6b7280" }}>Nível:</span>
                  <span className={`icp-badge ${certSignResult.certificate.signatureLevel === "qualificada" ? "qualified" : "advanced"}`}>
                    {certSignResult.certificate.signatureLevel === "qualificada" ? "Qualificada" : "Avançada"}
                  </span>
                </div>
              </div>
            )}

            <div className="flex gap-8 justify-center mt-24" style={{ justifyContent: "center", flexWrap: "wrap" }}>
              {savedDocId && (
                <button className="btn btn-primary" onClick={handleDownload} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  📥 Baixar documento assinado
                </button>
              )}
              {savedEnvelopeId && (
                <Link href={`/envelopes/${savedEnvelopeId}`} className="btn btn-secondary">
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
                setOverlayFields([]);
                setSelectedOverlayId(null);
                setSignatureDataUrl(null);
                setTitle("");
                setSavedDocId(null);
                setSavedEnvelopeId(null);
                setVerificationCode(null);
                setAcceptedTerms(false);
                setSignMethod("electronic");
                setCertSignResult(null);
                setGovbrResult(null);
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

function normalizeFormValues(values: Record<string, string | boolean | string[]>) {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => {
      if (typeof value === "string") return value.trim().length > 0;
      if (Array.isArray(value)) return value.length > 0;
      return true;
    })
  );
}

function createOverlayField(tool: Exclude<FillTool, "signature">, page: number, x: number, y: number): OverlayField {
  const base = {
    id: `${tool}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: tool,
    page,
  } as const;

  if (tool === "text") {
    return {
      ...base,
      x: Math.max(0, Math.min(x - 12, 72)),
      y: Math.max(0, Math.min(y - 2.8, 94)),
      width: 24,
      height: 5.5,
      value: "",
    };
  }

  return {
    ...base,
    x: Math.max(0, Math.min(x - 2.5, 95)),
    y: Math.max(0, Math.min(y - 2.5, 95)),
    width: 5,
    height: 5,
    value: tool === "dot" ? "." : undefined,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function hasManualTextFields(fields: OverlayField[]) {
  return fields.some((field) => field.type === "text");
}

function areManualTextFieldsFilled(fields: OverlayField[]) {
  return fields
    .filter((field) => field.type === "text")
    .every((field) => (field.value ?? "").trim().length > 0);
}
