"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { api } from "../../../lib/api";
import Link from "next/link";

export default function GovBrCallbackPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");
  const [sessionData, setSessionData] = useState<any>(null);

  useEffect(() => {
    const sessionId = searchParams.get("session_id");
    const callbackStatus = searchParams.get("status");
    const returnPath = searchParams.get("return_path") || "/self-sign";

    if (!sessionId) {
      setStatus("error");
      setMessage("Sessão Gov.br não encontrada");
      return;
    }

    if (callbackStatus === "ok") {
      api
        .govbrSession(sessionId)
        .then((data: any) => {
          setSessionData(data);
          setStatus("success");

          // Store session data for the target page to pick up
          sessionStorage.setItem("govbr_session_id", sessionId);
          sessionStorage.setItem("govbr_session_data", JSON.stringify(data));

          // Redirect to the return path with session ID
          const separator = returnPath.includes("?") ? "&" : "?";
          const redirectUrl = `${returnPath}${separator}govbr_session=${sessionId}`;

          setTimeout(() => {
            router.push(redirectUrl);
          }, 2000);
        })
        .catch((err: any) => {
          setStatus("error");
          setMessage(err.message || "Erro ao obter dados da sessão Gov.br");
        });
    } else {
      setStatus("error");
      setMessage("Autenticação Gov.br falhou");
    }
  }, [searchParams, router]);

  return (
    <>
      <header className="topbar">
        <h1>ITSign</h1>
        <nav>
          <Link href="/dashboard">Dashboard</Link>
        </nav>
      </header>

      <main className="container" style={{ maxWidth: 540 }}>
        <div className="card text-center" style={{ padding: "48px 32px" }}>
          {status === "loading" && (
            <>
              <div className="loader" style={{ margin: "0 auto 16px" }} />
              <h2>Processando autenticação Gov.br…</h2>
              <p className="text-muted">Aguarde enquanto verificamos sua identidade.</p>
            </>
          )}

          {status === "success" && sessionData?.user && (
            <>
              <div style={{ fontSize: "3rem", marginBottom: 12 }}>✅</div>
              <h2>Identidade verificada com Gov.br</h2>
              <div style={{
                background: "#f0fdf4",
                border: "1px solid #86efac",
                borderRadius: 8,
                padding: 16,
                margin: "16px auto",
                maxWidth: 360,
                textAlign: "left",
              }}>
                <div style={{ display: "grid", gridTemplateColumns: "80px 1fr", gap: "6px 12px", fontSize: "0.9rem" }}>
                  <span style={{ color: "#6b7280", fontWeight: 600 }}>Nome:</span>
                  <span>{sessionData.user.name}</span>
                  <span style={{ color: "#6b7280", fontWeight: 600 }}>CPF:</span>
                  <span>{sessionData.user.cpf}</span>
                  <span style={{ color: "#6b7280", fontWeight: 600 }}>Nível:</span>
                  <span style={{ textTransform: "capitalize" }}>{sessionData.user.nivel}</span>
                </div>
              </div>
              <p className="text-muted text-sm" style={{ marginTop: 16 }}>
                Redirecionando para a assinatura do documento…
              </p>
            </>
          )}

          {status === "error" && (
            <>
              <div style={{ fontSize: "3rem", marginBottom: 12 }}>❌</div>
              <h2>Erro na autenticação Gov.br</h2>
              <p className="text-muted">{message}</p>
              <Link href="/self-sign" className="btn btn-primary" style={{ marginTop: 16 }}>
                Tentar novamente
              </Link>
            </>
          )}
        </div>
      </main>
    </>
  );
}
