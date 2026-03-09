"use client";

import { useState } from "react";

interface GovBrSignProps {
  onGovBrReady: () => void;
  onCancel: () => void;
  loading?: boolean;
  govbrResult?: {
    name: string;
    cpf: string;
    nivel: string;
    signatureLevel: string;
  } | null;
}

const NIVEL_LABELS: Record<string, { label: string; color: string; bg: string; desc: string }> = {
  ouro: {
    label: "Ouro",
    color: "#92400e",
    bg: "#fef3c7",
    desc: "Identidade verificada por biometria facial (TSE)",
  },
  prata: {
    label: "Prata",
    color: "#374151",
    bg: "#e5e7eb",
    desc: "Identidade validada via banco ou base governamental",
  },
  bronze: {
    label: "Bronze",
    color: "#9a3412",
    bg: "#fed7aa",
    desc: "Identificação básica por e-mail/CPF",
  },
};

export default function GovBrSign({
  onGovBrReady,
  onCancel,
  loading = false,
  govbrResult,
}: GovBrSignProps) {
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  return (
    <div className="govbr-container">
      <div className="govbr-header">
        <div className="govbr-logo">
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
            <rect width="40" height="40" rx="8" fill="#1351B4"/>
            <text x="50%" y="55%" dominantBaseline="middle" textAnchor="middle"
                  fill="white" fontSize="11" fontWeight="bold" fontFamily="sans-serif">
              GOV
            </text>
            <text x="50%" y="78%" dominantBaseline="middle" textAnchor="middle"
                  fill="#FFCD07" fontSize="7" fontWeight="bold" fontFamily="sans-serif">
              .BR
            </text>
          </svg>
        </div>
        <h3>Assinar com Gov.br</h3>
        <p className="govbr-desc">
          Utilize sua identidade digital Gov.br para assinar o documento com
          segurança e validade jurídica.
        </p>
      </div>

      {/* How it works */}
      <div className="govbr-steps">
        <div className="govbr-step">
          <span className="govbr-step-num">1</span>
          <div>
            <strong>Autentique-se no Gov.br</strong>
            <p>Faça login com sua conta Gov.br (CPF e senha)</p>
          </div>
        </div>
        <div className="govbr-step">
          <span className="govbr-step-num">2</span>
          <div>
            <strong>Autorize a assinatura</strong>
            <p>Confirme que deseja assinar o documento</p>
          </div>
        </div>
        <div className="govbr-step">
          <span className="govbr-step-num">3</span>
          <div>
            <strong>Assinatura registrada</strong>
            <p>Seu CPF e identidade digital são vinculados ao documento</p>
          </div>
        </div>
      </div>

      {/* Gov.br session result (after authentication) */}
      {govbrResult && (
        <div className="govbr-user-info">
          <strong>✅ Identidade verificada</strong>
          <div className="govbr-user-details">
            <span className="govbr-label">Nome:</span>
            <span>{govbrResult.name}</span>
            <span className="govbr-label">CPF:</span>
            <span>{govbrResult.cpf}</span>
            <span className="govbr-label">Nível:</span>
            <span>
              <span
                className="govbr-nivel-badge"
                style={{
                  background: NIVEL_LABELS[govbrResult.nivel]?.bg ?? "#e5e7eb",
                  color: NIVEL_LABELS[govbrResult.nivel]?.color ?? "#374151",
                }}
              >
                {NIVEL_LABELS[govbrResult.nivel]?.label ?? govbrResult.nivel}
              </span>
            </span>
          </div>
          <p className="govbr-nivel-desc">
            {NIVEL_LABELS[govbrResult.nivel]?.desc}
          </p>
        </div>
      )}

      {/* Nivel info */}
      <div className="govbr-info-box">
        <strong>ℹ️ Níveis de confiabilidade Gov.br</strong>
        <div className="govbr-niveles">
          <div className="govbr-nivel">
            <span className="govbr-nivel-badge" style={{ background: "#fef3c7", color: "#92400e" }}>Ouro</span>
            <span>Biometria facial — Assinatura avançada</span>
          </div>
          <div className="govbr-nivel">
            <span className="govbr-nivel-badge" style={{ background: "#e5e7eb", color: "#374151" }}>Prata</span>
            <span>Validação bancária — Assinatura avançada</span>
          </div>
          <div className="govbr-nivel">
            <span className="govbr-nivel-badge" style={{ background: "#fed7aa", color: "#9a3412" }}>Bronze</span>
            <span>Identificação básica — Assinatura simples</span>
          </div>
        </div>
      </div>

      {/* Legal info */}
      <div className="govbr-legal-box">
        <strong>📜 Base Legal</strong>
        <p>
          Assinatura realizada com Gov.br tem validade jurídica nos termos do{" "}
          <strong>Decreto 10.543/2020</strong> e <strong>Lei 14.063/2020</strong>.
          O nível da assinatura depende do grau de confiabilidade da sua conta Gov.br.
        </p>
      </div>

      {/* Terms */}
      <div className="govbr-terms">
        <label>
          <input
            type="checkbox"
            checked={acceptedTerms}
            onChange={(e) => setAcceptedTerms(e.target.checked)}
          />
          <span>
            Declaro que autorizo o uso da minha identidade digital Gov.br para
            assinar este documento, nos termos da Lei 14.063/2020 e Decreto 10.543/2020.
          </span>
        </label>
      </div>

      {/* Actions */}
      <div className="govbr-actions">
        <button
          type="button"
          className="btn-secondary"
          onClick={onCancel}
          disabled={loading}
        >
          Cancelar
        </button>
        <button
          type="button"
          className="btn-govbr"
          onClick={onGovBrReady}
          disabled={loading || !acceptedTerms}
        >
          {loading ? (
            "Processando…"
          ) : (
            <>
              <svg width="18" height="18" viewBox="0 0 40 40" fill="none" style={{ display: "inline", verticalAlign: "middle", marginRight: 6 }}>
                <rect width="40" height="40" rx="8" fill="#1351B4"/>
                <text x="50%" y="55%" dominantBaseline="middle" textAnchor="middle"
                      fill="white" fontSize="11" fontWeight="bold" fontFamily="sans-serif">
                  GOV
                </text>
                <text x="50%" y="78%" dominantBaseline="middle" textAnchor="middle"
                      fill="#FFCD07" fontSize="7" fontWeight="bold" fontFamily="sans-serif">
                  .BR
                </text>
              </svg>
              Assinar com Gov.br
            </>
          )}
        </button>
      </div>
    </div>
  );
}
