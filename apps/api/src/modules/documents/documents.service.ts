import { sql, useMemory } from "../../db.js";
import { insertIntoStore, findInStore } from "../../lib/memory-store.js";
import { uuid, sha256 } from "../../lib/crypto.js";
import { NotFoundError } from "../../lib/errors.js";
import { config } from "../../config.js";
import { mkdir, writeFile, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

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

  const modifiedBytes = await pdfDoc.save();
  return Buffer.from(modifiedBytes);
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
