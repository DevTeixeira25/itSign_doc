"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { api } from "../../../lib/api";
import Link from "next/link";

export default function VerifyPage() {
  const params = useParams();
  const codeFromUrl = params.code as string;

  const [code, setCode] = useState(codeFromUrl || "");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);

  // Auto-verify if code is in URL
  useState(() => {
    if (codeFromUrl) {
      doVerify(codeFromUrl);
    }
  });

  async function doVerify(verificationCode?: string) {
    const c = (verificationCode || code).trim().toUpperCase();
    if (!c) {
      setError("Informe o código de verificação");
      return;
    }
    setError("");
    setLoading(true);
    setSearched(true);
    try {
      const data = await api.verifyDocument(c);
      setResult(data);
    } catch (err: any) {
      setResult(null);
      setError(err.message || "Código de verificação inválido");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <header className="topbar">
        <h1>ITSign</h1>
        <nav>
          <Link href="/">Início</Link>
        </nav>
      </header>

      <main className="container" style={{ maxWidth: 800 }}>
        <div className="card" style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: "2.5rem", marginBottom: 8 }}>🔍</div>
          <h2>Verificar Documento Assinado</h2>
          <p className="text-muted text-sm">
            Insira o código de verificação para confirmar a autenticidade e integridade de um documento assinado pelo ITSign.
          </p>

          <div style={{ display: "flex", gap: 8, maxWidth: 480, margin: "24px auto 0" }}>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="Ex: ITSN-A3F8-BC12-D9E4"
              style={{ flex: 1, fontFamily: "monospace", fontSize: "1.1rem", letterSpacing: 1, textAlign: "center" }}
              onKeyDown={(e) => e.key === "Enter" && doVerify()}
            />
            <button className="btn btn-primary" onClick={() => doVerify()} disabled={loading}>
              {loading ? "Verificando…" : "Verificar"}
            </button>
          </div>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        {result && (
          <div className="card">
            {/* Status banner */}
            <div
              className="verify-status-banner"
              style={{
                background: result.valid ? "#dcfce7" : "#fef2f2",
                border: `2px solid ${result.valid ? "#22c55e" : "#ef4444"}`,
                borderRadius: 12,
                padding: "20px 24px",
                textAlign: "center",
                marginBottom: 24,
              }}
            >
              <div style={{ fontSize: "2rem" }}>{result.valid ? "✅" : "❌"}</div>
              <h2 style={{ color: result.valid ? "#166534" : "#991b1b", margin: "8px 0 4px" }}>
                {result.valid ? "Documento Válido" : "Verificação Falhou"}
              </h2>
              <p style={{ color: result.valid ? "#15803d" : "#b91c1c", margin: 0, fontSize: "0.9rem" }}>
                {result.valid
                  ? "A integridade do documento e das assinaturas foi verificada com sucesso."
                  : "O certificado pode ter sido adulterado. A integridade não pôde ser confirmada."}
              </p>
            </div>

            {/* Verification details */}
            <div className="verify-section">
              <h3>📋 Informações do Documento</h3>
              <table className="verify-table">
                <tbody>
                  <tr>
                    <td className="verify-label">Título</td>
                    <td>{result.envelope?.title}</td>
                  </tr>
                  <tr>
                    <td className="verify-label">Arquivo</td>
                    <td>{result.document?.fileName}</td>
                  </tr>
                  <tr>
                    <td className="verify-label">Hash do documento (SHA-256)</td>
                    <td style={{ fontFamily: "monospace", fontSize: "0.8rem", wordBreak: "break-all" }}>
                      {result.document?.sha256Hash}
                    </td>
                  </tr>
                  <tr>
                    <td className="verify-label">Hash do certificado</td>
                    <td style={{ fontFamily: "monospace", fontSize: "0.8rem", wordBreak: "break-all" }}>
                      {result.certificateHash}
                    </td>
                  </tr>
                  <tr>
                    <td className="verify-label">Código de verificação</td>
                    <td style={{ fontFamily: "monospace", fontWeight: 600 }}>{result.verificationCode}</td>
                  </tr>
                  <tr>
                    <td className="verify-label">Verificação de integridade</td>
                    <td>
                      <span style={{
                        background: result.integrityCheck === "PASS" ? "#dcfce7" : "#fef2f2",
                        color: result.integrityCheck === "PASS" ? "#166534" : "#991b1b",
                        padding: "2px 10px",
                        borderRadius: 6,
                        fontWeight: 600,
                        fontSize: "0.85rem",
                      }}>
                        {result.integrityCheck === "PASS" ? "✓ APROVADA" : "✗ REPROVADA"}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Timeline */}
            <div className="verify-section" style={{ marginTop: 24 }}>
              <h3>📅 Cronologia</h3>
              <table className="verify-table">
                <tbody>
                  <tr>
                    <td className="verify-label">Criado em</td>
                    <td>{result.envelope?.createdAt ? new Date(result.envelope.createdAt).toLocaleString("pt-BR") : "—"}</td>
                  </tr>
                  <tr>
                    <td className="verify-label">Concluído em</td>
                    <td>{result.envelope?.completedAt ? new Date(result.envelope.completedAt).toLocaleString("pt-BR") : "—"}</td>
                  </tr>
                  <tr>
                    <td className="verify-label">Certificado gerado em</td>
                    <td>{result.generatedAt ? new Date(result.generatedAt).toLocaleString("pt-BR") : "—"}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Signers */}
            {result.signatures && result.signatures.length > 0 && (
              <div className="verify-section" style={{ marginTop: 24 }}>
                <h3>✍️ Assinantes ({result.signatures.length})</h3>
                {result.signatures.map((sig: any, i: number) => (
                  <div
                    key={i}
                    style={{
                      border: "1px solid #e5e7eb",
                      borderRadius: 8,
                      padding: 16,
                      marginBottom: 12,
                      background: "#fafafa",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <strong>{sig.name}</strong>
                      <span
                        style={{
                          background: "#dcfce7",
                          color: "#166534",
                          padding: "2px 10px",
                          borderRadius: 6,
                          fontSize: "0.8rem",
                          fontWeight: 600,
                        }}
                      >
                        ✓ Assinado
                      </span>
                    </div>
                    <table className="verify-table" style={{ marginBottom: 0 }}>
                      <tbody>
                        <tr>
                          <td className="verify-label">E-mail</td>
                          <td>{sig.email}</td>
                        </tr>
                        <tr>
                          <td className="verify-label">Tipo</td>
                          <td>
                            {sig.signatureType === "draw"
                              ? "Desenho manual"
                              : sig.signatureType === "type"
                              ? "Digitada"
                              : sig.signatureType === "certificate_icp"
                              ? "Certificado Digital"
                              : sig.signatureType}
                            {" "}
                            {sig.signatureType === "certificate_icp" ? (
                              <span className={`icp-badge ${sig.icpBrasil?.isIcpBrasil ? "qualified" : "advanced"}`}>
                                {sig.icpBrasil?.isIcpBrasil ? "ICP-Brasil Qualificada" : "Avançada"}
                              </span>
                            ) : sig.govbr ? (
                              <span className={`govbr-nivel-badge ${sig.govbr.nivel || "prata"}`}>
                                Gov.br {sig.govbr.nivel === "ouro" ? "Ouro" : sig.govbr.nivel === "prata" ? "Prata" : "Bronze"}
                              </span>
                            ) : (
                              <span className="icp-badge advanced">Avançada</span>
                            )}
                          </td>
                        </tr>
                        {sig.govbr && (
                          <>
                            <tr>
                              <td className="verify-label">Identidade Gov.br</td>
                              <td>{sig.govbr.name}</td>
                            </tr>
                            {sig.govbr.cpf && (
                              <tr>
                                <td className="verify-label">CPF</td>
                                <td>{sig.govbr.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.***.***-$4")}</td>
                              </tr>
                            )}
                            <tr>
                              <td className="verify-label">Nível Gov.br</td>
                              <td>
                                <span className={`govbr-nivel-badge ${sig.govbr.nivel || "prata"}`}>
                                  {sig.govbr.nivel === "ouro" ? "Ouro" : sig.govbr.nivel === "prata" ? "Prata" : "Bronze"}
                                </span>
                              </td>
                            </tr>
                            <tr>
                              <td className="verify-label">Nível assinatura</td>
                              <td>
                                <span className={`icp-badge ${sig.govbr.signatureLevel === "qualificada" ? "qualified" : "advanced"}`}>
                                  {sig.govbr.signatureLevel === "qualificada" ? "Qualificada" : "Avançada"}
                                </span>
                              </td>
                            </tr>
                            <tr>
                              <td className="verify-label">Base legal</td>
                              <td>{sig.govbr.legalBasis || "Decreto 10.543/2020"}</td>
                            </tr>
                          </>
                        )}
                        {sig.icpBrasil && (
                          <>
                            <tr>
                              <td className="verify-label">Certificado</td>
                              <td>{sig.icpBrasil.certificateCN}</td>
                            </tr>
                            {sig.icpBrasil.cpf && (
                              <tr>
                                <td className="verify-label">CPF</td>
                                <td>{sig.icpBrasil.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.***.***-$4")}</td>
                              </tr>
                            )}
                            {sig.icpBrasil.cnpj && (
                              <tr>
                                <td className="verify-label">CNPJ</td>
                                <td>{sig.icpBrasil.cnpj}</td>
                              </tr>
                            )}
                            <tr>
                              <td className="verify-label">Emissor</td>
                              <td>{sig.icpBrasil.issuer} ({sig.icpBrasil.issuerCN})</td>
                            </tr>
                            <tr>
                              <td className="verify-label">Tipo cert.</td>
                              <td>{sig.icpBrasil.certType}</td>
                            </tr>
                            <tr>
                              <td className="verify-label">Nº série</td>
                              <td style={{ fontFamily: "monospace", fontSize: "0.75rem", wordBreak: "break-all" }}>{sig.icpBrasil.serialNumber}</td>
                            </tr>
                            <tr>
                              <td className="verify-label">Fingerprint</td>
                              <td style={{ fontFamily: "monospace", fontSize: "0.75rem", wordBreak: "break-all" }}>{sig.icpBrasil.fingerprint}</td>
                            </tr>
                          </>
                        )}
                        <tr>
                          <td className="verify-label">Data/hora</td>
                          <td>{sig.signedAt ? new Date(sig.signedAt).toLocaleString("pt-BR") : "—"}</td>
                        </tr>
                        <tr>
                          <td className="verify-label">IP</td>
                          <td style={{ fontFamily: "monospace" }}>{sig.ipAddress ?? "—"}</td>
                        </tr>
                        {sig.signatureHash && (
                          <tr>
                            <td className="verify-label">Hash da assinatura</td>
                            <td style={{ fontFamily: "monospace", fontSize: "0.75rem", wordBreak: "break-all" }}>{sig.signatureHash}</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            )}

            {/* Legal basis */}
            {result.legalBasis && (
              <div className="verify-section" style={{ marginTop: 24 }}>
                <h3>⚖️ Fundamento Legal</h3>
                <div style={{
                  background: result.legalBasis.icpBrasil ? "#f0fdf4" : "#eff6ff",
                  border: `1px solid ${result.legalBasis.icpBrasil ? "#86efac" : "#bfdbfe"}`,
                  borderRadius: 8,
                  padding: 16,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <p style={{ margin: 0, fontWeight: 600 }}>
                      {result.legalBasis.law} — {result.legalBasis.article}
                    </p>
                    {result.legalBasis.icpBrasil ? (
                      <span className="icp-badge qualified">ICP-Brasil</span>
                    ) : result.legalBasis.govbr ? (
                      <span className="govbr-nivel-badge prata">Gov.br</span>
                    ) : null}
                  </div>
                  <p style={{ margin: "0 0 8px", fontWeight: 500, fontSize: "0.9rem" }}>
                    {result.legalBasis.complementary}
                  </p>
                  <p style={{ margin: 0, fontSize: "0.85rem", color: "#374151" }}>
                    {result.legalBasis.description}
                  </p>
                </div>
              </div>
            )}

            {/* Footer */}
            <div style={{ marginTop: 24, textAlign: "center", color: "#6b7280", fontSize: "0.8rem" }}>
              <p>Verificação realizada na plataforma <strong>{result.platform ?? "ITSign"}</strong></p>
              <p>A autenticidade deste documento pode ser verificada a qualquer momento usando o código acima.</p>
            </div>
          </div>
        )}

        {searched && !loading && !result && !error && (
          <div className="card text-center">
            <p className="text-muted">Nenhum documento encontrado com este código.</p>
          </div>
        )}
      </main>
    </>
  );
}
