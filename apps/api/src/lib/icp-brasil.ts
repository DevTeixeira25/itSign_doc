/**
 * ICP-Brasil Certificate Service
 *
 * Handles parsing and validation of A1 digital certificates (.pfx / .p12)
 * issued by ICP-Brasil accredited Certificate Authorities.
 *
 * Legal basis: Lei 14.063/2020 Art. 4° III — assinatura eletrônica qualificada
 *              MP 2.200-2/2001 — ICP-Brasil
 *
 * This module can:
 *  1. Parse a .pfx/.p12 file (PKCS#12) given the password
 *  2. Extract certificate info (subject name, CPF/CNPJ, issuer, validity)
 *  3. Validate the certificate (expiration, key usage)
 *  4. Sign a document hash using the private key (PKCS#7 / CMS)
 *  5. Verify that the issuer belongs to the ICP-Brasil chain
 */

import forge from "node-forge";

// ── Known ICP-Brasil root and intermediate CA identifiers ───────────
// In production, you'd maintain the full CA chain. These are the main
// organizational patterns found in ICP-Brasil certificates.
const ICP_BRASIL_PATTERNS = [
  "ICP-Brasil",
  "AC Raiz Brasileira",
  "Autoridade Certificadora",
  "AC SOLUTI",
  "AC SERASA",
  "AC CERTISIGN",
  "AC VALID",
  "AC DIGITAL",
  "AC SAFEWEB",
  "AC BOA VISTA",
  "AC FENACOR",
  "AC BR RFB",          // Receita Federal
  "AC CAIXA",
  "AC PRODEMGE",
  "AC SERPRO",
  "AC IMPRENSA OFICIAL",
  "AC OAB",
  "BIRD ID",
  "VIDAAS",
];

// ── Types ───────────────────────────────────────────────────────────

export interface CertificateInfo {
  /** Subject common name */
  commonName: string;
  /** Subject email (if present) */
  email: string | null;
  /** CPF extracted from certificate (OID 2.16.76.1.3.1) or CN */
  cpf: string | null;
  /** CNPJ extracted from certificate (OID 2.16.76.1.3.3) or CN */
  cnpj: string | null;
  /** Issuer organization */
  issuerOrg: string;
  /** Issuer common name */
  issuerCN: string;
  /** Certificate serial number (hex) */
  serialNumber: string;
  /** Not valid before */
  validFrom: string;
  /** Not valid after */
  validAfter: string;
  /** Whether the certificate is currently valid (not expired) */
  isValid: boolean;
  /** Whether the issuer matches known ICP-Brasil CAs */
  isIcpBrasil: boolean;
  /** Certificate type: A1 (software) / A3 (hardware) - inferred */
  certType: "A1" | "A3" | "unknown";
  /** Key usage (digitalSignature, nonRepudiation, etc.) */
  keyUsage: string[];
  /** SHA-256 fingerprint of the certificate */
  fingerprint: string;
}

export interface SignResult {
  /** PKCS#7 / CMS signature in base64 (DER-encoded) */
  signatureBase64: string;
  /** Certificate info used for signing */
  certificate: CertificateInfo;
  /** Hash that was signed */
  documentHash: string;
  /** Timestamp of signature */
  signedAt: string;
}

// ── Parse PKCS#12 (.pfx / .p12) ────────────────────────────────────

/**
 * Parse a PKCS#12 certificate file and extract certificate + private key.
 * @param pfxBuffer - The raw .pfx/.p12 file as a Buffer
 * @param password - The certificate password
 * @returns Parsed certificate info and internal handles for signing
 */
export function parseCertificate(pfxBuffer: Buffer, password: string): {
  info: CertificateInfo;
  cert: forge.pki.Certificate;
  privateKey: forge.pki.PrivateKey;
  chain: forge.pki.Certificate[];
} {
  // Decode the PKCS#12 file
  const p12Der = forge.util.decode64(pfxBuffer.toString("base64"));
  const p12Asn1 = forge.asn1.fromDer(p12Der);

  let p12: forge.pkcs12.Pkcs12Pfx;
  try {
    p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, password);
  } catch (err: any) {
    if (err.message?.includes("Invalid password") || err.message?.includes("PKCS#12")) {
      throw new Error("Senha do certificado inválida");
    }
    throw new Error("Arquivo de certificado inválido. Esperado formato .pfx ou .p12");
  }

  // Extract certificate bags
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
  const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });

  const certBagList = certBags[forge.pki.oids.certBag] ?? [];
  const keyBagList = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag] ?? [];

  if (certBagList.length === 0) {
    throw new Error("Nenhum certificado encontrado no arquivo .pfx");
  }

  if (keyBagList.length === 0) {
    throw new Error("Nenhuma chave privada encontrada no arquivo .pfx");
  }

  const cert = certBagList[0].cert!;
  const privateKey = keyBagList[0].key!;

  // Build chain (all certs except the end-entity)
  const chain = certBagList.slice(1).map((b) => b.cert!).filter(Boolean);

  const info = extractCertificateInfo(cert);

  return { info, cert, privateKey, chain };
}

// ── Extract info from X.509 certificate ─────────────────────────────

function extractCertificateInfo(cert: forge.pki.Certificate): CertificateInfo {
  const subject = cert.subject;
  const issuer = cert.issuer;

  const cn = subject.getField("CN")?.value ?? "";
  const email = subject.getField("E")?.value ?? subject.getField({ name: "emailAddress" })?.value ?? null;

  const issuerOrg = issuer.getField("O")?.value ?? "";
  const issuerCN = issuer.getField("CN")?.value ?? "";

  // Extract CPF/CNPJ from the certificate
  // ICP-Brasil certificates encode CPF in OID 2.16.76.1.3.1
  // and CNPJ in OID 2.16.76.1.3.3 within subjectAltName
  const cpf = extractCpfFromCert(cert, cn);
  const cnpj = extractCnpjFromCert(cert, cn);

  // Check validity
  const now = new Date();
  const validFrom = cert.validity.notBefore;
  const validAfter = cert.validity.notAfter;
  const isValid = now >= validFrom && now <= validAfter;

  // Check if issuer is ICP-Brasil
  const issuerText = `${issuerOrg} ${issuerCN}`.toUpperCase();
  const isIcpBrasil = ICP_BRASIL_PATTERNS.some((p) =>
    issuerText.includes(p.toUpperCase())
  );

  // Key usage
  const keyUsage = extractKeyUsage(cert);

  // Certificate type (A1 = software, typically 1 year validity; A3 = hardware, 3+ years)
  const validityDays = (validAfter.getTime() - validFrom.getTime()) / (1000 * 60 * 60 * 24);
  const certType = validityDays <= 400 ? "A1" : validityDays <= 1100 ? "A1" : "A3";

  // Fingerprint
  const certDer = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
  const md = forge.md.sha256.create();
  md.update(certDer, "raw");
  const fingerprint = md.digest().toHex();

  return {
    commonName: cn,
    email,
    cpf,
    cnpj,
    issuerOrg,
    issuerCN,
    serialNumber: cert.serialNumber,
    validFrom: validFrom.toISOString(),
    validAfter: validAfter.toISOString(),
    isValid,
    isIcpBrasil,
    certType: certType as "A1" | "A3",
    keyUsage,
    fingerprint,
  };
}

function extractCpfFromCert(cert: forge.pki.Certificate, cn: string): string | null {
  // Try to extract CPF from subject alternative names or CN
  // ICP-Brasil often encodes: "NAME:CPF" in CN
  const cpfMatch = cn.match(/(\d{3}\.?\d{3}\.?\d{3}-?\d{2})/);
  if (cpfMatch) return cpfMatch[1].replace(/\D/g, "");

  // Try from extensions (OID 2.16.76.1.3.1)
  try {
    const ext = cert.getExtension("subjectAltName") as any;
    if (ext?.altNames) {
      for (const name of ext.altNames) {
        if (name.value) {
          const match = name.value.match(/(\d{11})/);
          if (match) return match[1];
        }
      }
    }
  } catch {
    // Extension not found
  }

  return null;
}

function extractCnpjFromCert(cert: forge.pki.Certificate, cn: string): string | null {
  const cnpjMatch = cn.match(/(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})/);
  if (cnpjMatch) return cnpjMatch[1].replace(/\D/g, "");

  try {
    const ext = cert.getExtension("subjectAltName") as any;
    if (ext?.altNames) {
      for (const name of ext.altNames) {
        if (name.value) {
          const match = name.value.match(/(\d{14})/);
          if (match && match[1].length === 14) return match[1];
        }
      }
    }
  } catch {
    // Extension not found
  }

  return null;
}

function extractKeyUsage(cert: forge.pki.Certificate): string[] {
  const usage: string[] = [];
  try {
    const ext = cert.getExtension("keyUsage") as any;
    if (ext) {
      if (ext.digitalSignature) usage.push("digitalSignature");
      if (ext.nonRepudiation) usage.push("nonRepudiation");
      if (ext.keyEncipherment) usage.push("keyEncipherment");
      if (ext.dataEncipherment) usage.push("dataEncipherment");
    }
  } catch {
    // Extension not found
  }
  return usage;
}

// ── Sign document hash with certificate private key ─────────────────

/**
 * Sign a document hash using the certificate's private key.
 * Produces a PKCS#7 / CMS detached signature.
 *
 * @param documentHash - SHA-256 hash of the document to sign (hex string)
 * @param cert - The signer's certificate
 * @param privateKey - The signer's private key
 * @param chain - Certificate chain
 * @returns SignResult with the signature and certificate info
 */
export function signWithCertificate(
  documentHash: string,
  cert: forge.pki.Certificate,
  privateKey: forge.pki.PrivateKey,
  chain: forge.pki.Certificate[] = []
): SignResult {
  // Create PKCS#7 signed data
  const p7 = forge.pkcs7.createSignedData();

  // Set the content to be signed (the document hash)
  p7.content = forge.util.createBuffer(documentHash, "utf8");

  // Add the signer's certificate
  p7.addCertificate(cert);

  // Add chain certificates
  for (const chainCert of chain) {
    p7.addCertificate(chainCert);
  }

  // Add the signer
  p7.addSigner({
    key: privateKey as any,
    certificate: cert,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      {
        type: forge.pki.oids.contentType,
        value: forge.pki.oids.data,
      },
      {
        type: forge.pki.oids.messageDigest,
        // Will be calculated automatically
      },
      {
        type: forge.pki.oids.signingTime,
        value: new Date().toISOString() as any,
      },
    ],
  });

  // Sign
  p7.sign();

  // Convert to DER then base64
  const asn1 = p7.toAsn1();
  const der = forge.asn1.toDer(asn1).getBytes();
  const signatureBase64 = forge.util.encode64(der);

  return {
    signatureBase64,
    certificate: extractCertificateInfo(cert),
    documentHash,
    signedAt: new Date().toISOString(),
  };
}

// ── Validate certificate ────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate a certificate for signing purposes.
 */
export function validateCertificate(info: CertificateInfo): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check expiration
  if (!info.isValid) {
    const now = new Date();
    const expiry = new Date(info.validAfter);
    if (now > expiry) {
      errors.push(`Certificado expirado em ${expiry.toLocaleDateString("pt-BR")}`);
    } else {
      errors.push(`Certificado ainda não é válido (início: ${new Date(info.validFrom).toLocaleDateString("pt-BR")})`);
    }
  }

  // Check key usage
  if (info.keyUsage.length > 0) {
    if (!info.keyUsage.includes("digitalSignature") && !info.keyUsage.includes("nonRepudiation")) {
      errors.push("Certificado não possui permissão para assinatura digital (keyUsage)");
    }
  }

  // Check ICP-Brasil chain
  if (!info.isIcpBrasil) {
    warnings.push("Certificado não foi emitido por uma Autoridade Certificadora reconhecida da cadeia ICP-Brasil. A assinatura será do tipo avançada (não qualificada).");
  }

  // Check approaching expiration (30 days)
  const expiry = new Date(info.validAfter);
  const daysLeft = (expiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  if (daysLeft > 0 && daysLeft <= 30) {
    warnings.push(`Certificado expira em ${Math.floor(daysLeft)} dias`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
