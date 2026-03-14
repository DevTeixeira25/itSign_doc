import Link from "next/link";
import type { ReactNode } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

const sections = [
  {
    id: "overview",
    title: "Visão geral",
    body:
      "A API do ITSign expõe endpoints autenticados para operação administrativa e endpoints públicos para assinatura, download e verificação de documentos.",
    bullets: [
      "Base local: http://localhost:3001",
      "Base path: /v1",
      "Swagger UI: /docs na API",
    ],
  },
  {
    id: "auth",
    title: "Autenticação",
    body:
      "Os endpoints protegidos exigem um Firebase ID Token válido no header Authorization. O backend valida o token e tenta localizar o usuário local pelo firebase_uid ou e-mail.",
    code: `Authorization: Bearer <firebase_id_token>`,
    response: `{
  "statusCode": 401,
  "error": "Unauthorized",
  "message": "Token invalido ou expirado"
}`,
  },
  {
    id: "admin-flow",
    title: "Fluxo administrativo",
    body: "Fluxo recomendado para sistemas integrados autenticados.",
    bullets: [
      "Obter Firebase ID Token no cliente autenticado",
      "Registrar o usuário local, se necessário",
      "Fazer upload do PDF",
      "Criar o envelope com destinatários",
      "Enviar o envelope",
      "Consultar status e código de verificação",
    ],
    code: `curl -X POST ${API_URL}/v1/auth/register \\
  -H "Authorization: Bearer <firebase_id_token>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "organizationName": "Empresa Exemplo LTDA",
    "name": "Maria Souza",
    "email": "maria@empresa.com"
  }'`,
  },
  {
    id: "documents",
    title: "Documentos",
    body: "O upload registra o arquivo, calcula hash SHA-256 e devolve o documentId para uso posterior no envelope.",
    code: `curl -X POST ${API_URL}/v1/documents \\
  -H "Authorization: Bearer <firebase_id_token>" \\
  -F "file=@./contrato.pdf"`,
    response: `{
  "id": "0af6bf2e-0ca7-4af3-a45c-d0e8de6739a0",
  "fileName": "contrato.pdf",
  "mimeType": "application/pdf",
  "sha256Hash": "f8f9c0..."
}`,
  },
  {
    id: "envelopes",
    title: "Envelopes",
    body:
      "A criação do envelope retorna os destinatários e pode incluir o accessToken do assinante. Esse token deve ser tratado como segredo.",
    code: `curl -X POST ${API_URL}/v1/envelopes \\
  -H "Authorization: Bearer <firebase_id_token>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "title": "Contrato de Prestacao de Servicos",
    "documentId": "<document_id>",
    "recipients": [
      {
        "name": "Ana Cliente",
        "email": "ana@cliente.com",
        "role": "signer",
        "signingOrder": 1
      }
    ]
  }'`,
    response: `{
  "id": "f9b53298-9a44-4d44-95d2-59bf9db0107c",
  "status": "draft",
  "recipients": [
    {
      "name": "Ana Cliente",
      "accessToken": "token_publico_do_destinatario"
    }
  ]
}`,
  },
  {
    id: "public-sign",
    title: "Assinatura pública por link",
    body:
      "O sistema externo pode distribuir o accessToken para o destinatário. O destinatário consulta o token, assina e depois pode baixar o PDF assinado.",
    code: `curl ${API_URL}/v1/sign/<token_publico>

curl -X POST ${API_URL}/v1/sign/<token_publico> \\
  -H "Content-Type: application/json" \\
  -d '{
    "signatureData": "data:image/png;base64,iVBORw0KGgoAAA...",
    "signatureType": "draw",
    "signaturePosition": {
      "page": 1,
      "x": 20,
      "y": 75,
      "width": 28,
      "height": 12
    }
  }'`,
  },
  {
    id: "verification",
    title: "Verificação pública",
    body: "Depois que o envelope é concluído, o documento pode ser validado por código de verificação público.",
    code: `curl ${API_URL}/v1/verify/ITSN-A3F8-BC12-D9E4`,
    response: `{
  "valid": true,
  "verificationCode": "ITSN-A3F8-BC12-D9E4",
  "integrityCheck": "PASS",
  "document": {
    "fileName": "contrato.pdf"
  }
}`,
  },
  {
    id: "certificate",
    title: "Certificado ICP-Brasil",
    body:
      "A API aceita validação e assinatura com certificado .pfx ou .p12. O endpoint de assinatura depende do recipientToken público.",
    code: `curl -X POST ${API_URL}/v1/sign-with-certificate \\
  -F "certificate=@./certificado.pfx" \\
  -F "password=123456" \\
  -F "recipientToken=<token_publico>"`,
  },
  {
    id: "govbr",
    title: "Gov.br",
    body:
      "Há fluxos autenticados e públicos. Em desenvolvimento, a rota quick-sign só funciona com GOVBR_MOCK=true.",
    code: `curl -X POST ${API_URL}/v1/govbr/authorize \\
  -H "Authorization: Bearer <firebase_id_token>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "envelopeId": "<envelope_id>",
    "recipientToken": "<token_publico>",
    "documentTitle": "Contrato de Prestacao de Servicos",
    "returnPath": "/self-sign"
  }'`,
  },
];

const endpointGroups = [
  {
    title: "Envio e gestão autenticada",
    items: [
      {
        method: "POST",
        path: "/v1/auth/register",
        auth: "Bearer Firebase ID Token",
        summary: "Cria o usuário local e a organização inicial.",
        request: [
          ["organizationName", "string", "Sim", "Nome da organização"],
          ["name", "string", "Sim", "Nome do usuário local"],
          ["email", "string", "Sim", "E-mail do usuário autenticado"],
        ],
        response: [
          ["user.id", "string", "ID interno do usuário"],
          ["user.organizationId", "string", "ID interno da organização"],
          ["user.name", "string", "Nome persistido"],
          ["user.email", "string", "E-mail persistido"],
        ],
      },
      {
        method: "POST",
        path: "/v1/documents",
        auth: "Bearer Firebase ID Token",
        summary: "Faz upload do PDF e retorna o documento registrado.",
        request: [
          ["file", "multipart file", "Sim", "Arquivo PDF ou documento suportado"],
        ],
        response: [
          ["id", "string", "ID do documento"],
          ["organizationId", "string", "Organização proprietária"],
          ["fileName", "string", "Nome original do arquivo"],
          ["mimeType", "string", "Tipo MIME"],
          ["sha256Hash", "string", "Hash de integridade"],
          ["createdAt", "string", "Timestamp ISO"],
        ],
      },
      {
        method: "POST",
        path: "/v1/envelopes",
        auth: "Bearer Firebase ID Token",
        summary: "Cria um envelope em rascunho para envio.",
        request: [
          ["title", "string", "Sim", "Título do envelope"],
          ["documentId", "string", "Sim", "Documento previamente enviado"],
          ["recipients[].name", "string", "Sim", "Nome do destinatário"],
          ["recipients[].email", "string", "Sim", "E-mail do destinatário"],
          ["recipients[].role", "signer|approver|viewer", "Sim", "Papel no fluxo"],
          ["recipients[].signingOrder", "number", "Sim", "Ordem de assinatura"],
          ["expiresAt", "string", "Não", "Data ISO 8601 de expiração"],
        ],
        response: [
          ["id", "string", "ID do envelope"],
          ["status", "draft", "Status inicial"],
          ["documentId", "string", "Documento vinculado"],
          ["recipients[].id", "string", "ID do destinatário"],
          ["recipients[].accessToken", "string", "Token público do destinatário"],
        ],
      },
      {
        method: "POST",
        path: "/v1/envelopes/:id/send",
        auth: "Bearer Firebase ID Token",
        summary: "Move o envelope de rascunho para enviado.",
        request: [
          ["id", "path param", "Sim", "ID do envelope"],
        ],
        response: [
          ["id", "string", "Envelope atualizado"],
          ["status", "sent|in_progress", "Novo status"],
        ],
      },
      {
        method: "GET",
        path: "/v1/envelopes",
        auth: "Bearer Firebase ID Token",
        summary: "Lista envelopes da organização.",
        request: [
          ["page", "number", "Não", "Página, mínimo 1"],
          ["pageSize", "number", "Não", "Itens por página, 1 a 100"],
        ],
        response: [
          ["data[]", "array", "Lista de envelopes"],
          ["total", "number", "Total disponível"],
          ["page", "number", "Página atual"],
          ["pageSize", "number", "Quantidade retornada"],
        ],
      },
    ],
  },
  {
    title: "Assinatura pública e download",
    items: [
      {
        method: "GET",
        path: "/v1/sign/:token",
        auth: "Pública",
        summary: "Consulta o contexto do destinatário para assinatura.",
        request: [
          ["token", "path param", "Sim", "Access token público do destinatário"],
        ],
        response: [
          ["recipientId", "string", "ID do destinatário"],
          ["recipientName", "string", "Nome do destinatário"],
          ["recipientEmail", "string", "E-mail do destinatário"],
          ["role", "string", "Papel no fluxo"],
          ["envelopeTitle", "string", "Título do envelope"],
          ["documentFileName", "string", "Nome do arquivo"],
          ["envelopeStatus", "string", "Status do envelope"],
          ["alreadySigned", "boolean", "Se já assinou"],
        ],
      },
      {
        method: "POST",
        path: "/v1/sign/:token",
        auth: "Pública",
        summary: "Aplica assinatura desenhada, digitada ou por imagem.",
        request: [
          ["token", "path param", "Sim", "Access token público"],
          ["signatureData", "string", "Sim", "Base64, texto digitado ou imagem"],
          ["signatureType", "draw|type|upload", "Sim", "Modo de assinatura"],
          ["signaturePosition.page", "number", "Não", "Página 1-based"],
          ["signaturePosition.x", "number", "Não", "Posição X em %"],
          ["signaturePosition.y", "number", "Não", "Posição Y em %"],
          ["signaturePosition.width", "number", "Não", "Largura em %"],
          ["signaturePosition.height", "number", "Não", "Altura em %"],
        ],
        response: [
          ["signed", "boolean", "Se a assinatura foi registrada"],
          ["envelopeCompleted", "boolean", "Se o envelope foi concluído"],
          ["recipientId", "string", "Destinatário assinado"],
          ["verificationCode", "string|null", "Código gerado ao concluir"],
        ],
      },
      {
        method: "GET",
        path: "/v1/sign/:token/download",
        auth: "Pública",
        summary: "Baixa o PDF assinado após o próprio destinatário assinar.",
        request: [
          ["token", "path param", "Sim", "Access token público"],
        ],
        response: [
          ["binary", "application/pdf", "Arquivo assinado"],
          ["Content-Disposition", "header", "Nome sugerido do arquivo"],
        ],
      },
    ],
  },
  {
    title: "Verificação, certificado e Gov.br",
    items: [
      {
        method: "GET",
        path: "/v1/verify/:code",
        auth: "Pública",
        summary: "Valida um documento concluído por código de verificação.",
        request: [
          ["code", "path param", "Sim", "Código público do certificado de conclusão"],
        ],
        response: [
          ["valid", "boolean", "Resultado da validação"],
          ["verificationCode", "string", "Código consultado"],
          ["integrityCheck", "string", "PASS ou falha"],
          ["certificateHash", "string", "Hash do certificado"],
          ["document.fileName", "string", "Nome do arquivo"],
          ["document.sha256Hash", "string", "Hash do documento"],
          ["envelope.title", "string", "Título do envelope"],
          ["signatures[]", "array", "Assinaturas aplicadas"],
        ],
      },
      {
        method: "POST",
        path: "/v1/certificates/validate",
        auth: "Pública",
        summary: "Valida um certificado .pfx ou .p12 sem assinar.",
        request: [
          ["file", "multipart file", "Sim", "Arquivo .pfx ou .p12"],
          ["password", "string", "Sim", "Senha do certificado"],
        ],
        response: [
          ["certificate.commonName", "string", "Nome do titular"],
          ["certificate.cpf", "string|null", "CPF do titular"],
          ["certificate.cnpj", "string|null", "CNPJ do titular"],
          ["certificate.issuerCN", "string", "Emissor"],
          ["validation.valid", "boolean", "Se o certificado é válido"],
          ["validation.errors[]", "array", "Erros de validação"],
          ["validation.warnings[]", "array", "Alertas de validação"],
        ],
      },
      {
        method: "POST",
        path: "/v1/sign-with-certificate",
        auth: "Pública",
        summary: "Assina usando certificado digital e recipientToken.",
        request: [
          ["certificate", "multipart file", "Sim", "Arquivo .pfx ou .p12"],
          ["password", "string", "Sim", "Senha do certificado"],
          ["recipientToken", "string", "Sim", "Token público do destinatário"],
          ["envelopeId", "string", "Sim", "ID do envelope"],
          ["signaturePosition", "json string", "Não", "Posição da assinatura"],
        ],
        response: [
          ["signed", "boolean", "Se assinou"],
          ["envelopeCompleted", "boolean", "Se concluiu o envelope"],
          ["recipientId", "string", "ID do destinatário"],
          ["verificationCode", "string|null", "Código gerado"],
          ["certificate.signatureLevel", "string", "Nível jurídico"],
          ["warnings[]", "array", "Avisos da operação"],
        ],
      },
      {
        method: "POST",
        path: "/v1/govbr/authorize",
        auth: "Bearer Firebase ID Token",
        summary: "Inicia o fluxo Gov.br autenticado.",
        request: [
          ["envelopeId", "string", "Não", "Envelope relacionado"],
          ["recipientToken", "string", "Não", "Token público do destinatário"],
          ["documentTitle", "string", "Não", "Título exibido no fluxo"],
          ["returnPath", "string", "Não", "Rota de retorno no frontend"],
        ],
        response: [
          ["authUrl", "string", "URL de redirecionamento OAuth2"],
          ["sessionId", "string", "Sessão Gov.br criada"],
        ],
      },
      {
        method: "GET",
        path: "/v1/govbr/session/:sessionId",
        auth: "Pública",
        summary: "Consulta o estado da sessão Gov.br.",
        request: [
          ["sessionId", "path param", "Sim", "Sessão retornada no authorize"],
        ],
        response: [
          ["sessionId", "string", "Sessão consultada"],
          ["status", "string", "authenticated, pending etc."],
          ["user.name", "string", "Nome no Gov.br"],
          ["user.cpf", "string", "CPF mascarado ou retornado"],
          ["user.email", "string", "E-mail do Gov.br"],
          ["user.nivel", "string", "Bronze, prata ou ouro"],
        ],
      },
    ],
  },
];

function renderCode(code: string) {
  return code.split("\n").map((line, lineIndex) => {
    const parts: ReactNode[] = [];
    const regex = /("(?:\\.|[^"])*")|(\b\d+(?:\.\d+)?\b)|(#.*$)/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(line)) !== null) {
      if (match.index > lastIndex) {
        parts.push(line.slice(lastIndex, match.index));
      }

      const token = match[0];
      const nextChar = line.slice(regex.lastIndex).trimStart()[0];
      const isKey = token.startsWith("\"") && nextChar === ":";

      parts.push(
        <span
          key={`${lineIndex}-${match.index}`}
          className={
            match[3]
              ? "token-comment"
              : match[2]
                ? "token-number"
                : isKey
                  ? "token-key"
                  : "token-string"
          }
        >
          {token}
        </span>,
      );

      lastIndex = regex.lastIndex;
    }

    if (lastIndex < line.length) {
      parts.push(line.slice(lastIndex));
    }

    return (
      <span key={lineIndex} className="api-docs-code-line">
        {parts.length > 0 ? parts : " "}
      </span>
    );
  });
}

export default function ApiDocsPage() {
  return (
    <>
      <header className="topbar">
        <h1>ITSign</h1>
        <nav>
          <Link href="/dashboard">Dashboard</Link>
          <Link href="/api-docs">API Docs</Link>
          <a href={`${API_URL}/docs`} target="_blank" rel="noreferrer">
            Swagger
          </a>
        </nav>
      </header>

      <main className="container api-docs-page">
        <section className="api-hero card">
          <div>
            <span className="api-kicker">Integração</span>
            <h2>Documentação da API</h2>
            <p>
              Referência web para integração com sistemas externos, cobrindo autenticação,
              upload, envelopes, assinatura pública, verificação e fluxos avançados.
            </p>
          </div>
          <div className="api-hero-actions">
            <a className="btn btn-primary" href={`${API_URL}/docs`} target="_blank" rel="noreferrer">
              Abrir Swagger
            </a>
            <a className="btn btn-secondary" href={`${API_URL}/docs/json`} target="_blank" rel="noreferrer">
              OpenAPI JSON
            </a>
          </div>
        </section>

        <div className="api-docs-layout">
          <aside className="api-docs-nav card">
            <h3>Navegação</h3>
            <div className="api-docs-links">
              {sections.map((section) => (
                <a key={section.id} href={`#${section.id}`}>
                  {section.title}
                </a>
              ))}
            </div>
          </aside>

          <div className="api-docs-content">
            {sections.map((section) => (
              <section key={section.id} id={section.id} className="card api-docs-section">
                <h3>{section.title}</h3>
                <p>{section.body}</p>
                {section.bullets ? (
                  <ul className="api-docs-list">
                    {section.bullets.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : null}
                {section.code ? (
                  <>
                    <p className="api-docs-label">Exemplo</p>
                    <pre className="api-docs-code">
                      <code className="api-docs-code-text">{renderCode(section.code)}</code>
                    </pre>
                  </>
                ) : null}
                {section.response ? (
                  <>
                    <p className="api-docs-label">Resposta</p>
                    <pre className="api-docs-code">
                      <code className="api-docs-code-text">{renderCode(section.response)}</code>
                    </pre>
                  </>
                ) : null}
              </section>
            ))}

            <section className="card api-docs-section" id="endpoints">
              <h3>Parâmetros por endpoint</h3>
              <p>
                Referência rápida dos campos que sua integração precisa enviar e dos principais
                dados que a API devolve em cada etapa.
              </p>

              {endpointGroups.map((group) => (
                <div key={group.title} className="api-endpoint-group">
                  <h4>{group.title}</h4>
                  <div className="api-endpoint-list">
                    {group.items.map((item) => (
                      <article key={`${item.method}-${item.path}`} className="api-endpoint-card">
                        <div className="api-endpoint-head">
                          <div className="api-endpoint-title">
                            <span className={`api-method api-method-${item.method.toLowerCase()}`}>
                              {item.method}
                            </span>
                            <code>{item.path}</code>
                          </div>
                          <span className="api-endpoint-auth">{item.auth}</span>
                        </div>
                        <p className="api-endpoint-summary">{item.summary}</p>

                        <div className="api-endpoint-block">
                          <p className="api-docs-label">Parâmetros enviados</p>
                          <div className="api-param-table">
                            <div className="api-param-row api-param-head">
                              <span>Campo</span>
                              <span>Tipo</span>
                              <span>Obrigatório</span>
                              <span>Descrição</span>
                            </div>
                            {item.request.map((row) => (
                              <div key={row[0]} className="api-param-row">
                                <code>{row[0]}</code>
                                <span>{row[1]}</span>
                                <span>{row[2]}</span>
                                <span>{row[3]}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="api-endpoint-block">
                          <p className="api-docs-label">Campos retornados</p>
                          <div className="api-param-table">
                            <div className="api-param-row api-param-head">
                              <span>Campo</span>
                              <span>Tipo</span>
                              <span>Descrição</span>
                            </div>
                            {item.response.map((row) => (
                              <div key={row[0]} className="api-param-row api-param-row-3">
                                <code>{row[0]}</code>
                                <span>{row[1]}</span>
                                <span>{row[2]}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              ))}
            </section>

            <section className="card api-docs-section">
              <h3>Boas práticas</h3>
              <ul className="api-docs-list">
                <li>Trate o recipientToken como credencial sensível.</li>
                <li>Armazene documentId, envelopeId, recipientId e verificationCode para rastreabilidade.</li>
                <li>Use endpoints de consulta antes de sincronizar o status no sistema externo.</li>
                <li>Em multipart, não force Content-Type application/json.</li>
                <li>Em desenvolvimento, o backend pode operar em memória sem persistência.</li>
              </ul>
            </section>
          </div>
        </div>
      </main>
    </>
  );
}
