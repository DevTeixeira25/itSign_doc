"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { loadPdfDocument, renderPdfPage } from "../lib/pdf";

interface PdfViewerProps {
  fileUrl: string;
  /** If provided, shows a signature field overlay the user can move */
  signatureFields?: SignatureField[];
  onFieldsChange?: (fields: SignatureField[]) => void;
  /** If true, allow placing new fields by clicking on the page */
  editMode?: boolean;
  onAddField?: (field: { page: number; x: number; y: number }) => void;
  scale?: number;
}

export interface SignatureField {
  id: string;
  type: "signature" | "text" | "date" | "initials";
  page: number;
  x: number; // percentage from left
  y: number; // percentage from top
  width: number; // percentage
  height: number; // percentage
  label: string;
  recipientIndex?: number;
  value?: string;
}

export default function PdfViewer({
  fileUrl,
  signatureFields = [],
  onFieldsChange,
  editMode = false,
  onAddField,
  scale = 1.5,
}: PdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [rendering, setRendering] = useState(false);

  // Load the PDF document
  useEffect(() => {
    let cancelled = false;
    loadPdfDocument(fileUrl).then((doc) => {
      if (!cancelled) {
        setPdfDoc(doc);
        setNumPages(doc.numPages);
      }
    }).catch((err) => console.error("Failed to load PDF:", err));
    return () => { cancelled = true; };
  }, [fileUrl]);

  // Render pages
  const renderSinglePage = useCallback(async (pageNum: number) => {
    if (!pdfDoc) return;
    const canvas = canvasRefs.current.get(pageNum);
    if (!canvas) return;
    await renderPdfPage(pdfDoc, pageNum, canvas, scale);
  }, [pdfDoc, scale]);

  useEffect(() => {
    if (!pdfDoc) return;
    setRendering(true);
    const pages = [];
    for (let i = 1; i <= numPages; i++) {
      pages.push(renderSinglePage(i));
    }
    Promise.all(pages).then(() => setRendering(false));
  }, [pdfDoc, numPages, renderSinglePage]);

  function handlePageClick(pageNum: number, e: React.MouseEvent<HTMLDivElement>) {
    if (!editMode || !onAddField) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    onAddField({ page: pageNum, x, y });
  }

  if (!pdfDoc) {
    return (
      <div className="pdf-loading">
        <div className="loader" />
        <p>Carregando PDF…</p>
      </div>
    );
  }

  return (
    <div className="pdf-viewer" ref={containerRef}>
      <div className="pdf-toolbar">
        <button
          className="btn btn-secondary btn-sm"
          disabled={currentPage <= 1}
          onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
        >
          ← Anterior
        </button>
        <span className="text-sm">
          Página {currentPage} de {numPages}
        </span>
        <button
          className="btn btn-secondary btn-sm"
          disabled={currentPage >= numPages}
          onClick={() => setCurrentPage((p) => Math.min(numPages, p + 1))}
        >
          Próxima →
        </button>
      </div>

      <div className="pdf-pages">
        {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => (
          <div
            key={pageNum}
            className={`pdf-page-container ${pageNum === currentPage ? "active" : "hidden"}`}
            onClick={(e) => handlePageClick(pageNum, e)}
            style={{ cursor: editMode ? "crosshair" : "default" }}
          >
            <canvas
              ref={(el) => {
                if (el) canvasRefs.current.set(pageNum, el);
              }}
            />
            {/* Field overlays */}
            {signatureFields
              .filter((f) => f.page === pageNum)
              .map((field) => (
                <div
                  key={field.id}
                  className={`pdf-field pdf-field-${field.type} ${field.value ? "pdf-field-filled" : ""}`}
                  style={{
                    left: `${field.x}%`,
                    top: `${field.y}%`,
                    width: `${field.width}%`,
                    height: `${field.height}%`,
                  }}
                >
                  <span className="pdf-field-label">{field.label}</span>
                  {field.value && field.type === "signature" && (
                    <img src={field.value} alt="Assinatura" className="pdf-field-sig-img" />
                  )}
                  {field.value && field.type !== "signature" && (
                    <span className="pdf-field-value">{field.value}</span>
                  )}
                </div>
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}
