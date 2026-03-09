"use client";

import { useState, useRef } from "react";

interface CertificateUploadProps {
  onCertificateReady: (file: File, password: string) => void;
  onCancel: () => void;
  loading?: boolean;
}

export default function CertificateUpload({
  onCertificateReady,
  onCancel,
  loading = false,
}: CertificateUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) {
      const ext = f.name.toLowerCase();
      if (!ext.endsWith(".pfx") && !ext.endsWith(".p12")) {
        setError("Formato inválido. Selecione um arquivo .pfx ou .p12");
        return;
      }
      setFile(f);
      setError("");
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("Selecione o seu certificado digital (.pfx ou .p12)");
      return;
    }
    if (!password) {
      setError("Informe a senha do certificado");
      return;
    }
    setError("");
    onCertificateReady(file, password);
  }

  return (
    <div className="cert-upload-container">
      <div className="cert-upload-header">
        <div className="cert-upload-icon">🔐</div>
        <h3>Certificado Digital ICP-Brasil</h3>
        <p className="cert-upload-desc">
          Selecione seu certificado digital A1 (arquivo .pfx ou .p12) e informe a senha
          para realizar uma assinatura eletrônica qualificada.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="cert-upload-form">
        {/* File selector */}
        <div className="cert-field">
          <label htmlFor="cert-file">Certificado Digital (.pfx / .p12)</label>
          <div
            className={`cert-dropzone ${file ? "cert-dropzone-active" : ""}`}
            onClick={() => inputRef.current?.click()}
          >
            <input
              ref={inputRef}
              id="cert-file"
              type="file"
              accept=".pfx,.p12"
              onChange={handleFileChange}
              style={{ display: "none" }}
            />
            {file ? (
              <div className="cert-file-info">
                <span className="cert-file-icon">📄</span>
                <span className="cert-file-name">{file.name}</span>
                <span className="cert-file-size">
                  ({(file.size / 1024).toFixed(1)} KB)
                </span>
              </div>
            ) : (
              <div className="cert-dropzone-text">
                <span className="cert-dropzone-icon">📎</span>
                <span>Clique para selecionar o certificado</span>
                <span className="cert-dropzone-hint">
                  Formatos aceitos: .pfx, .p12
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Password */}
        <div className="cert-field">
          <label htmlFor="cert-password">Senha do Certificado</label>
          <div className="cert-password-wrapper">
            <input
              id="cert-password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Digite a senha do certificado"
              className="cert-password-input"
              autoComplete="off"
            />
            <button
              type="button"
              className="cert-password-toggle"
              onClick={() => setShowPassword(!showPassword)}
              tabIndex={-1}
            >
              {showPassword ? "🙈" : "👁️"}
            </button>
          </div>
        </div>

        {error && <div className="cert-error">{error}</div>}

        {/* Info box */}
        <div className="cert-info-box">
          <strong>ℹ️ Segurança</strong>
          <p>
            Seu certificado e senha são utilizados apenas para gerar a assinatura
            digital e <strong>não são armazenados</strong> em nossos servidores.
            A chave privada é descartada imediatamente após a assinatura.
          </p>
        </div>

        {/* Legal info */}
        <div className="cert-legal-box">
          <strong>📜 Base Legal</strong>
          <p>
            Assinatura realizada com certificado ICP-Brasil constitui{" "}
            <strong>assinatura eletrônica qualificada</strong> nos termos do Art. 4°,
            inciso III da Lei 14.063/2020, possuindo presunção de veracidade e
            equivalência à assinatura manuscrita (MP 2.200-2/2001, Art. 10, §1°).
          </p>
        </div>

        {/* Actions */}
        <div className="cert-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={onCancel}
            disabled={loading}
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="btn-primary"
            disabled={loading || !file || !password}
          >
            {loading ? "Assinando..." : "Assinar com Certificado Digital"}
          </button>
        </div>
      </form>
    </div>
  );
}
