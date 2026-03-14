import { sql, useMemory } from "../../db.js";
import { insertIntoStore, findInStore } from "../../lib/memory-store.js";
import { uuid, sha256 } from "../../lib/crypto.js";
import { NotFoundError } from "../../lib/errors.js";
import { config } from "../../config.js";
import { mkdir, writeFile, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

export interface PdfFormFieldDefinition {
  name: string;
  label: string;
  type: "text" | "checkbox" | "dropdown" | "option_list" | "radio" | "signature" | "unknown";
  readOnly: boolean;
  required: boolean;
  options?: string[];
  value?: string | boolean | string[];
}

type PdfFormFieldValue = string | boolean | string[];
type OverlayField = {
  id?: string;
  type: "text" | "check" | "cross" | "dot";
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  value?: string;
};

export interface UploadDocumentInput {
  organizationId: string;
  uploadedBy: string;
  fileName: string;
  mimeType: string;
  data: Buffer;
}

export async function uploadDocument(input: UploadDocumentInput) {
  const docId = uuid();
  const hash = sha256(input.data);
  const storageKey = `documents/${input.organizationId}/${docId}`;

  const dir = join(config.storageDir, "documents", input.organizationId);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, docId), input.data);

  const row = {
    id: docId,
    organization_id: input.organizationId,
    file_name: input.fileName,
    mime_type: input.mimeType,
    storage_key: storageKey,
    sha256_hash: hash,
    uploaded_by: input.uploadedBy,
  };

  if (useMemory) {
    insertIntoStore("documents", row);
  } else {
    await sql`
      INSERT INTO documents (id, organization_id, file_name, mime_type, storage_key, sha256_hash, uploaded_by)
      VALUES (${docId}, ${input.organizationId}, ${input.fileName}, ${input.mimeType}, ${storageKey}, ${hash}, ${input.uploadedBy})
    `;
  }

  return {
    id: docId,
    organizationId: input.organizationId,
    fileName: input.fileName,
    mimeType: input.mimeType,
    storageKey,
    sha256Hash: hash,
    uploadedBy: input.uploadedBy,
    createdAt: new Date().toISOString(),
  };
}

export async function getDocument(documentId: string, organizationId: string) {
  if (useMemory) {
    const rows = findInStore("documents", (d) => d.id === documentId && d.organization_id === organizationId, 1);
    if (rows.length === 0) throw new NotFoundError("Documento");
    const d = rows[0];
    return { id: d.id, organizationId: d.organization_id, fileName: d.file_name, mimeType: d.mime_type, storageKey: d.storage_key, sha256Hash: d.sha256_hash, uploadedBy: d.uploaded_by, createdAt: d.created_at };
  }

  const rows = await sql`
    SELECT id, organization_id, file_name, mime_type, storage_key, sha256_hash, uploaded_by, created_at
    FROM documents WHERE id = ${documentId} AND organization_id = ${organizationId} LIMIT 1
  `;
  if (rows.length === 0) throw new NotFoundError("Documento");
  const d = rows[0];
  return { id: d.id, organizationId: d.organization_id, fileName: d.file_name, mimeType: d.mime_type, storageKey: d.storage_key, sha256Hash: d.sha256_hash, uploadedBy: d.uploaded_by, createdAt: d.created_at };
}

export async function listDocuments(organizationId: string) {
  if (useMemory) {
    return findInStore("documents", (d) => d.organization_id === organizationId)
      .sort((a: any, b: any) => b.created_at.localeCompare(a.created_at));
  }

  return sql`
    SELECT id, file_name, mime_type, sha256_hash, uploaded_by, created_at
    FROM documents WHERE organization_id = ${organizationId} ORDER BY created_at DESC
  `;
}

export async function getDocumentFile(documentId: string, organizationId: string): Promise<Buffer> {
  const filePath = join(config.storageDir, "documents", organizationId, documentId);
  try {
    return await readFile(filePath);
  } catch {
    throw new NotFoundError("Arquivo do documento não encontrado");
  }
}

export async function getDocumentFormFields(
  documentId: string,
  organizationId: string
): Promise<PdfFormFieldDefinition[]> {
  const file = await getDocumentFile(documentId, organizationId);
  return extractPdfFormFields(file);
}

export async function extractPdfFormFields(buffer: Buffer): Promise<PdfFormFieldDefinition[]> {
  let pdfDoc: PDFDocument;
  try {
    pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
  } catch {
    return [];
  }

  try {
    const form = pdfDoc.getForm();
    return form.getFields().map((field: any) => {
      const type = getPdfFieldType(field);
      return {
        name: field.getName(),
        label: humanizeFieldName(field.getName()),
        type,
        readOnly: typeof field.isReadOnly === "function" ? !!field.isReadOnly() : false,
        required: false,
        options: getPdfFieldOptions(field),
        value: getPdfFieldValue(field, type),
      };
    });
  } catch {
    return [];
  }
}

/**
 * Returns the document PDF with all signatures visually embedded.
 * Reads signature JSON files from ./storage/signatures/{envelopeId}/
 * and overlays them onto the original PDF using pdf-lib.
 */
export async function getSignedDocumentFile(
  documentId: string,
  organizationId: string,
  envelopeId: string
): Promise<Buffer> {
  const originalBuffer = await getDocumentFile(documentId, organizationId);

  // Load signature data for the envelope
  const sigDir = join(config.storageDir, "signatures", envelopeId);
  let sigFiles: string[] = [];
  try {
    sigFiles = (await readdir(sigDir)).filter((f) => f.endsWith(".json"));
  } catch {
    // No signatures directory → return original
    return originalBuffer;
  }

  if (sigFiles.length === 0) return originalBuffer;

  // Parse all signature JSONs
  const signatures: any[] = [];
  for (const f of sigFiles) {
    try {
      const data = JSON.parse(await readFile(join(sigDir, f), "utf-8"));
      signatures.push(data);
    } catch {
      // skip corrupt files
    }
  }

  if (signatures.length === 0) return originalBuffer;

  // Load PDF
  let pdfDoc: PDFDocument;
  try {
    pdfDoc = await PDFDocument.load(originalBuffer, { ignoreEncryption: true });
  } catch {
    // If pdf-lib can't parse (e.g. non-PDF file), return original
    return originalBuffer;
  }

  const pages = pdfDoc.getPages();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  applyPdfFormValues(pdfDoc, collectFilledFormValues(signatures));
  drawOverlayFields(pages, font, boldFont, collectOverlayFields(signatures));

  for (const sig of signatures) {
    const pos = sig.signaturePosition;
    const sigType = sig.signatureType ?? "draw";

    // Determine which page and coordinates
    // Position is in percentages (0-100) of page dimensions
    const pageIndex = pos ? Math.min(pos.page - 1, pages.length - 1) : pages.length - 1;
    const page = pages[Math.max(0, pageIndex)];
    const { width: pageW, height: pageH } = page.getSize();

    // Default position: bottom-right area of last page
    const xPct = pos?.x ?? 60;
    const yPct = pos?.y ?? 85;
    const wPct = pos?.width ?? 25;
    const hPct = pos?.height ?? 8;

    // Convert percentage to PDF coordinates (PDF origin is bottom-left)
    const x = (xPct / 100) * pageW;
    const y = pageH - ((yPct / 100) * pageH) - ((hPct / 100) * pageH);
    const w = (wPct / 100) * pageW;
    const h = (hPct / 100) * pageH;

    if (sigType === "draw" || sigType === "upload") {
      // Embed the signature image (base64 PNG data URL)
      const dataUrl = sig.signatureData ?? "";
      if (dataUrl.startsWith("data:image/png")) {
        try {
          const base64 = dataUrl.split(",")[1];
          const imgBytes = Buffer.from(base64, "base64");
          const pngImage = await pdfDoc.embedPng(imgBytes);
          const scaled = pngImage.scaleToFit(w, h);
          page.drawImage(pngImage, {
            x,
            y,
            width: scaled.width,
            height: scaled.height,
          });
        } catch {
          // Fallback: draw name as text
          drawSignatureStamp(page, font, boldFont, sig, x, y, w, h);
        }
      } else {
        drawSignatureStamp(page, font, boldFont, sig, x, y, w, h);
      }
    } else if (sigType === "type") {
      // Typed signature: render name in a handwriting-like style
      const name = sig.signatureData ?? sig.recipientName ?? "";
      const fontSize = Math.min(h * 0.5, 24);
      page.drawText(name, {
        x: x + 4,
        y: y + h * 0.35,
        size: fontSize,
        font: boldFont,
        color: rgb(0.06, 0.09, 0.16), // #0f172a
      });
      // Add small details below
      const detailSize = Math.min(7, h * 0.18);
      const signedAt = sig.signedAt ? new Date(sig.signedAt).toLocaleString("pt-BR") : "";
      page.drawText(`Assinado eletronicamente em ${signedAt}`, {
        x: x + 4,
        y: y + 4,
        size: detailSize,
        font,
        color: rgb(0.4, 0.45, 0.5),
      });
    } else {
      // Certificate, Gov.br, or unknown type → draw stamp
      drawSignatureStamp(page, font, boldFont, sig, x, y, w, h);
    }
  }

  try {
    pdfDoc.getForm().flatten();
  } catch {
    // Ignore PDFs without interactive forms.
  }

  const modifiedBytes = await pdfDoc.save();
  return Buffer.from(modifiedBytes);
}

function collectFilledFormValues(signatures: any[]): Record<string, PdfFormFieldValue> {
  const merged: Record<string, PdfFormFieldValue> = {};
  for (const sig of signatures) {
    const formFields = sig?.formFields;
    if (!formFields || typeof formFields !== "object") continue;
    for (const [name, value] of Object.entries(formFields)) {
      if (
        typeof value === "string" ||
        typeof value === "boolean" ||
        (Array.isArray(value) && value.every((item) => typeof item === "string"))
      ) {
        merged[name] = value;
      }
    }
  }
  return merged;
}

function collectOverlayFields(signatures: any[]): OverlayField[] {
  const fields: OverlayField[] = [];
  for (const sig of signatures) {
    const overlayFields = sig?.overlayFields;
    if (!Array.isArray(overlayFields)) continue;
    for (const field of overlayFields) {
      if (
        field &&
        typeof field.type === "string" &&
        typeof field.page === "number" &&
        typeof field.x === "number" &&
        typeof field.y === "number" &&
        typeof field.width === "number" &&
        typeof field.height === "number"
      ) {
        fields.push({
          id: typeof field.id === "string" ? field.id : undefined,
          type: field.type,
          page: field.page,
          x: field.x,
          y: field.y,
          width: field.width,
          height: field.height,
          value: typeof field.value === "string" ? field.value : undefined,
        });
      }
    }
  }
  return fields;
}

function applyPdfFormValues(pdfDoc: PDFDocument, values: Record<string, PdfFormFieldValue>) {
  const entries = Object.entries(values);
  if (entries.length === 0) return;

  try {
    const form = pdfDoc.getForm();
    const fields = form.getFields();
    for (const field of fields as any[]) {
      const name = field.getName();
      if (!(name in values)) continue;
      const value = values[name];
      const type = getPdfFieldType(field);

      try {
        if (type === "text" || type === "signature" || type === "unknown") {
          if (typeof value === "string" && typeof field.setText === "function") {
            field.setText(value);
          }
          continue;
        }

        if (type === "checkbox") {
          const checked = value === true || value === "true" || value === "1" || value === "yes";
          if (checked && typeof field.check === "function") field.check();
          if (!checked && typeof field.uncheck === "function") field.uncheck();
          continue;
        }

        if (type === "dropdown" || type === "radio") {
          const selected = Array.isArray(value) ? value[0] : value;
          if (typeof selected === "string" && typeof field.select === "function") {
            field.select(selected);
          }
          continue;
        }

        if (type === "option_list" && typeof field.select === "function") {
          if (Array.isArray(value)) {
            field.select(value);
          } else if (typeof value === "string") {
            field.select([value]);
          }
        }
      } catch {
        // Skip invalid values for individual form fields.
      }
    }
  } catch {
    // Ignore PDFs without interactive forms.
  }
}

function drawOverlayFields(
  pages: ReturnType<PDFDocument["getPages"]>,
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  boldFont: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  fields: OverlayField[]
) {
  for (const field of fields) {
    const page = pages[Math.max(0, Math.min(field.page - 1, pages.length - 1))];
    if (!page) continue;
    const { width: pageW, height: pageH } = page.getSize();
    const x = (field.x / 100) * pageW;
    const y = pageH - ((field.y / 100) * pageH) - ((field.height / 100) * pageH);
    const w = (field.width / 100) * pageW;
    const h = (field.height / 100) * pageH;

    if (field.type === "text") {
      const text = field.value?.trim() || "";
      if (!text) continue;
      page.drawText(text, {
        x: x + 2,
        y: y + Math.max(4, h * 0.2),
        size: Math.min(Math.max(10, h * 0.55), 20),
        font,
        color: rgb(0.06, 0.09, 0.16),
        maxWidth: Math.max(10, w - 4),
      });
      continue;
    }

    if (field.type === "check") {
      page.drawText("✓", {
        x: x + Math.max(2, w * 0.15),
        y: y + Math.max(1, h * 0.02),
        size: Math.min(Math.max(12, h * 0.9), 28),
        font: boldFont,
        color: rgb(0.1, 0.3, 0.1),
      });
      continue;
    }

    if (field.type === "cross") {
      page.drawText("X", {
        x: x + Math.max(2, w * 0.2),
        y: y + Math.max(1, h * 0.04),
        size: Math.min(Math.max(12, h * 0.85), 28),
        font: boldFont,
        color: rgb(0.55, 0.1, 0.1),
      });
      continue;
    }

    if (field.type === "dot") {
      page.drawCircle({
        x: x + w / 2,
        y: y + h / 2,
        size: Math.max(2, Math.min(w, h) * 0.3),
        color: rgb(0.06, 0.09, 0.16),
      });
    }
  }
}

function getPdfFieldType(field: any): PdfFormFieldDefinition["type"] {
  const name = field?.constructor?.name ?? "";
  if (name === "PDFTextField") return isSignatureNamedField(field?.getName?.()) ? "signature" : "text";
  if (name === "PDFCheckBox") return "checkbox";
  if (name === "PDFDropdown") return "dropdown";
  if (name === "PDFOptionList") return "option_list";
  if (name === "PDFRadioGroup") return "radio";
  return isSignatureNamedField(field?.getName?.()) ? "signature" : "unknown";
}

function getPdfFieldOptions(field: any): string[] | undefined {
  try {
    if (typeof field.getOptions === "function") {
      return (field.getOptions() as unknown[]).map((item) => String(item));
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function getPdfFieldValue(
  field: any,
  type: PdfFormFieldDefinition["type"]
): PdfFormFieldDefinition["value"] {
  try {
    if (type === "checkbox" && typeof field.isChecked === "function") {
      return !!field.isChecked();
    }
    if ((type === "text" || type === "signature" || type === "unknown") && typeof field.getText === "function") {
      return field.getText() ?? "";
    }
    if ((type === "dropdown" || type === "radio") && typeof field.getSelected === "function") {
      return field.getSelected() ?? "";
    }
    if (type === "option_list" && typeof field.getSelected === "function") {
      return field.getSelected() ?? [];
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function humanizeFieldName(name: string): string {
  return name
    .replace(/[_.-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^./, (char) => char.toUpperCase());
}

function isSignatureNamedField(name: string | undefined): boolean {
  if (!name) return false;
  return /\b(assinatura|assinar|signature|sign)\b/i.test(name);
}

/** Draw a text-based signature stamp (for certificate/govbr/fallback) */
function drawSignatureStamp(
  page: ReturnType<PDFDocument["getPages"]>[0],
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  boldFont: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  sig: any,
  x: number,
  y: number,
  w: number,
  h: number
) {
  // Light background
  page.drawRectangle({
    x,
    y,
    width: w,
    height: h,
    color: rgb(0.95, 0.97, 1),
    borderColor: rgb(0.2, 0.4, 0.8),
    borderWidth: 0.5,
  });

  const name = sig.recipientName ?? "Signatário";
  const sigType = sig.signatureType ?? "eletrônica";
  const signedAt = sig.signedAt ? new Date(sig.signedAt).toLocaleString("pt-BR") : "";
  const labelMap: Record<string, string> = {
    draw: "Assinatura Eletrônica",
    type: "Assinatura Eletrônica",
    certificate: "Assinatura Digital ICP-Brasil",
    govbr: "Assinatura Gov.br",
  };
  const label = labelMap[sigType] ?? "Assinatura Eletrônica";

  const titleSize = Math.min(9, h * 0.22);
  const nameSize = Math.min(11, h * 0.28);
  const detailSize = Math.min(7, h * 0.17);

  let cy = y + h - titleSize - 4;
  page.drawText(label, { x: x + 4, y: cy, size: titleSize, font: boldFont, color: rgb(0.2, 0.4, 0.8) });
  cy -= nameSize + 2;
  page.drawText(name, { x: x + 4, y: cy, size: nameSize, font: boldFont, color: rgb(0.06, 0.09, 0.16) });
  cy -= detailSize + 2;
  if (sig.recipientEmail) {
    page.drawText(sig.recipientEmail, { x: x + 4, y: cy, size: detailSize, font, color: rgb(0.4, 0.45, 0.5) });
    cy -= detailSize + 1;
  }
  if (signedAt) {
    page.drawText(signedAt, { x: x + 4, y: cy, size: detailSize, font, color: rgb(0.4, 0.45, 0.5) });
  }
}
