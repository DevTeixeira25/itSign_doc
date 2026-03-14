"use client";

import { useRef, useState } from "react";

interface SignaturePadProps {
  onSave: (dataUrl: string) => void;
  onCancel?: () => void;
  onCertificateSign?: () => void;
  onGovBrSign?: () => void;
  width?: number;
  height?: number;
}

export default function SignaturePad({
  onSave,
  onCancel,
  onCertificateSign,
  onGovBrSign,
  width = 500,
  height = 200,
}: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [mode, setMode] = useState<"draw" | "type">("draw");
  const [typedName, setTypedName] = useState("");

  function getSignatureColor() {
    return document.documentElement.dataset.theme === "dark" ? "#ffffff" : "#0f172a";
  }

  function startDraw(e: React.PointerEvent) {
    isDrawing.current = true;
    setHasDrawn(true);
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    ctx.beginPath();
    ctx.moveTo(
      (e.clientX - rect.left) * scaleX,
      (e.clientY - rect.top) * scaleY
    );
  }

  function draw(e: React.PointerEvent) {
    if (!isDrawing.current) return;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = getSignatureColor();
    ctx.lineTo(
      (e.clientX - rect.left) * scaleX,
      (e.clientY - rect.top) * scaleY
    );
    ctx.stroke();
  }

  function stopDraw() {
    isDrawing.current = false;
  }

  function clearCanvas() {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
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

  function handleSave() {
    if (mode === "draw") {
      if (!hasDrawn) return;
      const dataUrl = canvasRef.current ? exportSignatureAsBlack(canvasRef.current) : "";
      onSave(dataUrl);
    } else {
      if (!typedName.trim()) return;
      // Render typed name to canvas for consistent output
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "transparent";
      ctx.fillRect(0, 0, width, height);
      ctx.font = `italic ${Math.floor(height * 0.4)}px 'Brush Script MT', 'Segoe Script', cursive`;
      ctx.fillStyle = "#0f172a";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(typedName, width / 2, height / 2);
      onSave(canvas.toDataURL("image/png"));
    }
  }

  return (
    <div className="sig-pad-container">
      <div className="sig-pad-tabs">
        <button
          className={`sig-pad-tab ${mode === "draw" ? "active" : ""}`}
          onClick={() => setMode("draw")}
        >
          ✏️ Desenhar
        </button>
        <button
          className={`sig-pad-tab ${mode === "type" ? "active" : ""}`}
          onClick={() => setMode("type")}
        >
          ⌨️ Digitar
        </button>
        {onCertificateSign && (
          <button
            className="sig-pad-tab"
            onClick={onCertificateSign}
          >
            🔐 Certificado
          </button>
        )}
        {onGovBrSign && (
          <button
            className="sig-pad-tab"
            onClick={onGovBrSign}
          >
            🏛️ Gov.br
          </button>
        )}
      </div>

      {mode === "draw" ? (
        <div className="sig-pad-draw">
          <canvas
            ref={canvasRef}
            width={width}
            height={height}
            className="signature-pad"
            onPointerDown={startDraw}
            onPointerMove={draw}
            onPointerUp={stopDraw}
            onPointerLeave={stopDraw}
          />
          <button className="btn btn-secondary btn-sm" onClick={clearCanvas}>
            Limpar
          </button>
        </div>
      ) : (
        <div className="sig-pad-type">
          <input
            className="sig-type-input"
            value={typedName}
            onChange={(e) => setTypedName(e.target.value)}
            placeholder="Digite seu nome completo"
          />
          <div
            className="sig-type-preview"
            style={{ height }}
          >
            {typedName || "Sua assinatura"}
          </div>
        </div>
      )}

      <div className="sig-pad-actions">
        {onCancel && (
          <button className="btn btn-secondary" onClick={onCancel}>
            Cancelar
          </button>
        )}
        <button
          className="btn btn-primary"
          onClick={handleSave}
          disabled={mode === "draw" ? !hasDrawn : !typedName.trim()}
        >
          Confirmar assinatura
        </button>
      </div>
    </div>
  );
}
