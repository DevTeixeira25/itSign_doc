import { sql, useMemory } from "../../db.js";
import { insertIntoStore, findInStore } from "../../lib/memory-store.js";
import { uuid, sha256 } from "../../lib/crypto.js";
import { NotFoundError } from "../../lib/errors.js";
import { config } from "../../config.js";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

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
