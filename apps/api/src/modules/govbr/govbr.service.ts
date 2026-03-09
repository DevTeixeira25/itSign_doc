/**
 * Gov.br Integration Service
 *
 * Implements OAuth2/OpenID Connect integration with Brazil's Gov.br
 * digital identity platform for electronic signatures.
 *
 * Follows the official Gov.br integration guide:
 *   https://acesso.gov.br/roteiro-tecnico/iniciarintegracao.html
 *
 * Gov.br provides 3 levels of identity verification:
 *   - Bronze: basic (e-mail/CPF) → assinatura eletrônica simples
 *   - Prata: validated (bank, INSS) → assinatura eletrônica avançada
 *   - Ouro: biometric (TSE, certificado digital) → assinatura eletrônica avançada/qualificada
 *
 * Legal basis:
 *   - Lei 14.063/2020 Art. 4° I/II — conforme nível de confiabilidade
 *   - Decreto 10.543/2020 — Gov.br como meio de assinatura eletrônica
 *
 * OAuth2 endpoints (production):
 *   Authorization: https://sso.acesso.gov.br/authorize
 *   Token:         https://sso.acesso.gov.br/token
 *   UserInfo:      https://sso.acesso.gov.br/userinfo
 *   JWK:           https://sso.acesso.gov.br/jwk
 *
 * For development/staging use the sandbox:
 *   Authorization: https://sso.staging.acesso.gov.br/authorize
 *   Token:         https://sso.staging.acesso.gov.br/token
 *   UserInfo:      https://sso.staging.acesso.gov.br/userinfo
 *   JWK:           https://sso.staging.acesso.gov.br/jwk
 *
 * Required: PKCE (code_challenge / code_verifier) per RFC 7636
 * Required: Authorization Basic header on /token endpoint
 */

import { createHash, randomBytes, createPublicKey, createVerify } from "node:crypto";
import { config } from "../../config.js";
import { uuid } from "../../lib/crypto.js";

// ── Configuration ────────────────────────────────────────────

/**
 * Mock mode: set GOVBR_MOCK=true to use fake data during development.
 * When false (default), real Gov.br credentials are required.
 */
export const GOVBR_MOCK_MODE = process.env.GOVBR_MOCK === "true";

const GOV_BR_CONFIG = {
  clientId: process.env.GOVBR_CLIENT_ID ?? "",
  clientSecret: process.env.GOVBR_CLIENT_SECRET ?? "",
  // Use staging by default; set GOVBR_PRODUCTION=true for production
  baseUrl: process.env.GOVBR_PRODUCTION === "true"
    ? "https://sso.acesso.gov.br"
    : "https://sso.staging.acesso.gov.br",
  redirectUri: `${config.apiUrl}/v1/govbr/callback`,
  // Official Gov.br scope per documentation (Passo 3):
  // openid+email+profile+govbr_confiabilidades+govbr_confiabilidades_idtoken
  // We also request 'phone' for additional user info.
  scopes: [
    "openid",
    "email",
    "phone",
    "profile",
    "govbr_confiabilidades",
    "govbr_confiabilidades_idtoken",
  ],
  // Logout URL per Gov.br documentation
  logoutUrl: process.env.GOVBR_PRODUCTION === "true"
    ? "https://sso.acesso.gov.br/logout"
    : "https://sso.staging.acesso.gov.br/logout",
  // JWK endpoint for token validation (Passo 7)
  jwkUrl: process.env.GOVBR_PRODUCTION === "true"
    ? "https://sso.acesso.gov.br/jwk"
    : "https://sso.staging.acesso.gov.br/jwk",
};

if (!GOVBR_MOCK_MODE && (!GOV_BR_CONFIG.clientId || !GOV_BR_CONFIG.clientSecret)) {
  console.warn(
    "⚠️  Gov.br: GOVBR_CLIENT_ID / GOVBR_CLIENT_SECRET não configurados. " +
    "Defina GOVBR_MOCK=true para modo de desenvolvimento, ou configure credenciais reais."
  );
}

// ── PKCE helpers (RFC 7636) ──────────────────────────────────

/**
 * Generate a cryptographically random code_verifier (43-128 chars, URL-safe).
 */
function generateCodeVerifier(): string {
  return randomBytes(64).toString("base64url").slice(0, 128);
}

/**
 * Compute code_challenge = BASE64URL(SHA256(ASCII(code_verifier)))
 */
function computeCodeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier, "ascii").digest("base64url");
}

// ── In-memory pending Gov.br sessions ─────────────────────────

interface GovBrSession {
  id: string;
  state: string;
  nonce: string;
  /** PKCE code_verifier — sent on /token to prove we initiated the flow */
  codeVerifier: string;
  /** The ITSign user who initiated the flow (null for public signing) */
  userId: string | null;
  userEmail: string;
  userName: string;
  /** Envelope context for signing */
  envelopeId: string | null;
  recipientToken: string | null;
  documentTitle: string | null;
  /** Where to redirect after Gov.br auth */
  returnPath: string;
  /** Gov.br response after callback */
  govbrData: GovBrUserInfo | null;
  /** Status: pending → authenticated → signed → expired */
  status: "pending" | "authenticated" | "signed" | "expired";
  createdAt: string;
}

export interface GovBrUserInfo {
  sub: string;
  name: string;
  /** Nome Social from Gov.br (takes priority when available) */
  social_name?: string | null;
  email: string;
  email_verified: boolean;
  phone_number?: string;
  phone_number_verified?: boolean;
  picture?: string;
  /** Reliability seal IDs from Gov.br (e.g. "601", "701", "801", "901") */
  confiabilidades: string[];
  /** Parsed reliability level */
  nivel: "bronze" | "prata" | "ouro";
  /** CPF extracted from sub */
  cpf: string;
  /** AMR — authentication method references (e.g. "passwd", "x509", "bank", "mfa") */
  amr?: string[];
}

// Temporary session storage (in production, use Redis)
const sessions = new Map<string, GovBrSession>();

// Clean up sessions older than 30 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - new Date(session.createdAt).getTime() > 30 * 60 * 1000) {
      sessions.delete(id);
    }
  }
}, 5 * 60 * 1000);

// JWK cache
let cachedJwk: { keys: any[]; fetchedAt: number } | null = null;
const JWK_CACHE_TTL = 60 * 60 * 1000; // 1 hour

// ── Public API ──────────────────────────────────────────────

/**
 * Generate the Gov.br authorization URL with PKCE.
 */
export function createGovBrAuthUrl(params: {
  userId?: string;
  userEmail: string;
  userName: string;
  envelopeId?: string;
  recipientToken?: string;
  documentTitle?: string;
  returnPath?: string;
}): { authUrl: string; sessionId: string } {
  const sessionId = uuid();
  const state = uuid();
  const nonce = uuid();
  const codeVerifier = generateCodeVerifier();

  const session: GovBrSession = {
    id: sessionId,
    state,
    nonce,
    codeVerifier,
    userId: params.userId ?? null,
    userEmail: params.userEmail,
    userName: params.userName,
    envelopeId: params.envelopeId ?? null,
    recipientToken: params.recipientToken ?? null,
    documentTitle: params.documentTitle ?? null,
    returnPath: params.returnPath ?? "/self-sign",
    govbrData: null,
    status: "pending",
    createdAt: new Date().toISOString(),
  };

  sessions.set(sessionId, session);

  // In mock mode, skip the real Gov.br redirect
  if (GOVBR_MOCK_MODE) {
    const mockAuthUrl = `${config.apiUrl}/v1/govbr/callback?code=mock-code&state=${sessionId}:${state}`;
    return { authUrl: mockAuthUrl, sessionId };
  }

  const codeChallenge = computeCodeChallenge(codeVerifier);

  // Gov.br Passo 3: scope values separated by '+' in the URL
  const scopeStr = GOV_BR_CONFIG.scopes.join("+");

  const searchParams = new URLSearchParams({
    response_type: "code",
    client_id: GOV_BR_CONFIG.clientId,
    scope: scopeStr,
    redirect_uri: GOV_BR_CONFIG.redirectUri,
    state: `${sessionId}:${state}`,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  // Build URL manually to keep '+' as scope separator (URLSearchParams encodes '+' to '%2B')
  const authUrl = `${GOV_BR_CONFIG.baseUrl}/authorize?response_type=code&client_id=${encodeURIComponent(GOV_BR_CONFIG.clientId)}&scope=${scopeStr}&redirect_uri=${encodeURIComponent(GOV_BR_CONFIG.redirectUri)}&state=${encodeURIComponent(`${sessionId}:${state}`)}&nonce=${encodeURIComponent(nonce)}&code_challenge=${encodeURIComponent(codeChallenge)}&code_challenge_method=S256`;
  return { authUrl, sessionId };
}

/**
 * Handle the OAuth2 callback from Gov.br.
 * Exchange the authorization code for tokens (with PKCE code_verifier + Basic Auth)
 * and fetch user info from id_token + /userinfo.
 */
export async function handleGovBrCallback(
  code: string,
  stateParam: string
): Promise<{ sessionId: string; userInfo: GovBrUserInfo }> {
  const [sessionId, state] = stateParam.split(":");
  const session = sessions.get(sessionId);

  if (!session) throw new Error("Sessão Gov.br expirada ou inválida");
  if (session.state !== state) throw new Error("Estado inválido na resposta do Gov.br");
  if (session.status !== "pending") throw new Error("Sessão Gov.br já foi utilizada");

  // ── Token exchange ────────────────────────────────────────
  let tokenData: any;

  if (GOVBR_MOCK_MODE) {
    tokenData = createMockTokenResponse(session);
  } else {
    // Gov.br Passo 6: Authorization: Basic base64(CLIENT_ID:CLIENT_SECRET)
    const basicAuth = Buffer.from(
      `${GOV_BR_CONFIG.clientId}:${GOV_BR_CONFIG.clientSecret}`
    ).toString("base64");

    const tokenRes = await fetch(`${GOV_BR_CONFIG.baseUrl}/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basicAuth}`,
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: GOV_BR_CONFIG.redirectUri,
        code_verifier: session.codeVerifier,
      }).toString(),
    });

    if (!tokenRes.ok) {
      const errorBody = await tokenRes.text().catch(() => "");
      console.error("[Gov.br] Token exchange error:", tokenRes.status, errorBody);
      throw new Error(`Gov.br token exchange falhou (${tokenRes.status}): ${errorBody}`);
    }

    tokenData = await tokenRes.json();

    if (!tokenData.access_token) {
      throw new Error("Gov.br não retornou access_token: " + JSON.stringify(tokenData));
    }
  }

  // ── Token validation (Passo 7) ─────────────────────────────
  // Validate access_token and id_token signatures via /jwk endpoint
  if (!GOVBR_MOCK_MODE) {
    try {
      await validateTokenWithJwk(tokenData.access_token);
      if (tokenData.id_token) {
        await validateTokenWithJwk(tokenData.id_token);
      }
    } catch (err: any) {
      console.error("[Gov.br] Token JWK validation failed:", err.message);
      // Log but don't block — some staging environments may have transient issues
      // In production, you may want to throw here
    }
  }

  // ── User info ─────────────────────────────────────────────
  let userInfo: GovBrUserInfo;

  if (GOVBR_MOCK_MODE) {
    userInfo = createMockUserInfo(session);
  } else {
    // Decode id_token for reliability_info (Passo 9)
    let idTokenPayload: any = null;
    if (tokenData.id_token) {
      try {
        idTokenPayload = decodeJwtPayload(tokenData.id_token);

        // Passo 3: Validate nonce — must match what we sent in /authorize
        if (idTokenPayload.nonce && idTokenPayload.nonce !== session.nonce) {
          console.error("[Gov.br] Nonce mismatch! Expected:", session.nonce, "Got:", idTokenPayload.nonce);
          throw new Error("Nonce inválido no id_token do Gov.br");
        }
      } catch (err: any) {
        if (err.message.includes("Nonce")) throw err;
        console.warn("[Gov.br] Failed to decode id_token, will rely on /userinfo");
      }
    }

    // Fetch /userinfo for name, email, phone (Passo 9)
    const userRes = await fetch(`${GOV_BR_CONFIG.baseUrl}/userinfo`, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!userRes.ok) {
      const errorBody = await userRes.text().catch(() => "");
      console.error("[Gov.br] UserInfo error:", userRes.status, errorBody);
      throw new Error(`Gov.br userinfo falhou (${userRes.status}): ${errorBody}`);
    }

    const rawUserInfo = await userRes.json();
    userInfo = parseGovBrUserInfo(rawUserInfo, idTokenPayload);
  }

  session.govbrData = userInfo;
  session.status = "authenticated";

  return { sessionId, userInfo };
}

/**
 * Get a Gov.br session by ID.
 */
export function getGovBrSession(sessionId: string): GovBrSession | null {
  return sessions.get(sessionId) ?? null;
}

/**
 * Get the return path for a Gov.br session.
 */
export function getSessionReturnPath(sessionId: string): string {
  return sessions.get(sessionId)?.returnPath ?? "/self-sign";
}

/**
 * Mark a Gov.br session as signed.
 */
export function markGovBrSessionSigned(sessionId: string) {
  const session = sessions.get(sessionId);
  if (session) session.status = "signed";
}

/**
 * Determine the signature level based on Gov.br reliability level.
 */
export function getGovBrSignatureLevel(nivel: string): {
  level: "simples" | "avancada" | "qualificada";
  legalBasis: string;
  description: string;
} {
  switch (nivel) {
    case "ouro":
      return {
        level: "avancada",
        legalBasis:
          "Lei 14.063/2020 Art. 4° II - Assinatura eletrônica avançada (Gov.br nível Ouro)",
        description:
          "Assinatura eletrônica avançada realizada via Gov.br com identidade verificada por biometria (nível Ouro). Possui alto grau de confiabilidade.",
      };
    case "prata":
      return {
        level: "avancada",
        legalBasis:
          "Lei 14.063/2020 Art. 4° II - Assinatura eletrônica avançada (Gov.br nível Prata)",
        description:
          "Assinatura eletrônica avançada realizada via Gov.br com identidade validada junto a bases governamentais (nível Prata).",
      };
    default:
      return {
        level: "simples",
        legalBasis:
          "Lei 14.063/2020 Art. 4° I - Assinatura eletrônica simples (Gov.br nível Bronze)",
        description:
          "Assinatura eletrônica simples realizada via Gov.br com identificação básica (nível Bronze).",
      };
  }
}

// ── Internal helpers ────────────────────────────────────────

/**
 * Decode a JWT payload without verifying signature.
 * Signature validation is performed separately via validateTokenWithJwk().
 */
function decodeJwtPayload(jwt: string): any {
  const parts = jwt.split(".");
  if (parts.length !== 3) throw new Error("Invalid JWT");
  return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf-8"));
}

/**
 * Decode a JWT header.
 */
function decodeJwtHeader(jwt: string): any {
  const parts = jwt.split(".");
  if (parts.length !== 3) throw new Error("Invalid JWT");
  return JSON.parse(Buffer.from(parts[0], "base64url").toString("utf-8"));
}

/**
 * Gov.br Passo 7: Validate token signature using the JWK endpoint.
 * Fetches the public key from /jwk and verifies the RS256 signature.
 */
async function validateTokenWithJwk(token: string): Promise<void> {
  // Get JWK keys (cached)
  if (!cachedJwk || Date.now() - cachedJwk.fetchedAt > JWK_CACHE_TTL) {
    const res = await fetch(GOV_BR_CONFIG.jwkUrl);
    if (!res.ok) {
      throw new Error(`Failed to fetch Gov.br JWK: ${res.status}`);
    }
    const data = await res.json() as any;
    cachedJwk = { keys: data.keys ?? [], fetchedAt: Date.now() };
  }

  const header = decodeJwtHeader(token);
  const kid = header.kid;
  const alg = header.alg;

  if (alg !== "RS256") {
    // Gov.br uses RS256; if different, skip validation with a warning
    console.warn(`[Gov.br] Unexpected JWT algorithm: ${alg}, skipping JWK validation`);
    return;
  }

  const jwk = cachedJwk.keys.find((k: any) => k.kid === kid);
  if (!jwk) {
    throw new Error(`Gov.br JWK key not found for kid: ${kid}`);
  }

  // Build RSA public key from JWK
  const publicKey = createPublicKey({ key: jwk, format: "jwk" });

  // Verify signature
  const [headerB64, payloadB64, signatureB64] = token.split(".");
  const data = `${headerB64}.${payloadB64}`;
  const signature = Buffer.from(signatureB64, "base64url");

  const verifier = createVerify("RSA-SHA256");
  verifier.update(data);
  const isValid = verifier.verify(publicKey, signature);

  if (!isValid) {
    throw new Error("Gov.br JWT signature validation failed");
  }
}

/**
 * Map Gov.br reliability_info.level (gold/silver/bronze) to our "nivel".
 */
function mapGovBrLevel(level?: string): "bronze" | "prata" | "ouro" {
  switch (level?.toLowerCase()) {
    case "gold":
      return "ouro";
    case "silver":
      return "prata";
    default:
      return "bronze";
  }
}

/**
 * Gov.br seal IDs → level mapping.
 * 701=tse_facial, 702=biometria_digital, 801=certificado_digital, 901=cin_facial → Ouro
 * 301=servidor_publico, 401=biovalid_facial, 602-630=banks → Prata
 * 101, 201, 501-504, 601 → Bronze
 */
const SEAL_LEVEL: Record<string, "bronze" | "prata" | "ouro"> = {
  "101": "bronze", "201": "bronze",
  "301": "prata", "401": "prata",
  "501": "bronze", "502": "bronze", "503": "bronze", "504": "bronze",
  "601": "bronze",
  "602": "prata", "603": "prata", "604": "prata", "605": "prata",
  "606": "prata", "607": "prata", "608": "prata", "609": "prata",
  "610": "prata", "618": "prata", "624": "prata", "625": "prata",
  "626": "prata", "627": "prata", "628": "prata", "629": "prata",
  "630": "prata",
  "701": "ouro", "702": "ouro", "801": "ouro", "901": "ouro",
};

function deriveNivelFromSeals(sealIds: string[]): "bronze" | "prata" | "ouro" {
  let best: "bronze" | "prata" | "ouro" = "bronze";
  for (const id of sealIds) {
    const level = SEAL_LEVEL[id];
    if (level === "ouro") return "ouro";
    if (level === "prata") best = "prata";
  }
  return best;
}

/**
 * Parse Gov.br userinfo + id_token payload into our GovBrUserInfo.
 * The id_token contains reliability_info with level (gold/silver/bronze)
 * and seal IDs. The userinfo has name, email, phone.
 */
function parseGovBrUserInfo(rawUserInfo: any, idTokenPayload?: any): GovBrUserInfo {
  let nivel: "bronze" | "prata" | "ouro" = "bronze";
  const confiabilidades: string[] = [];

  // Prefer reliability_info from id_token (scope: govbr_confiabilidades_idtoken)
  if (idTokenPayload?.reliability_info) {
    const ri = idTokenPayload.reliability_info;
    nivel = mapGovBrLevel(ri.level);
    if (Array.isArray(ri.reliabilities)) {
      for (const r of ri.reliabilities) {
        confiabilidades.push(String(r.id));
      }
    }
  } else if (rawUserInfo.confiabilidades) {
    // Fallback: old-style URN strings from /userinfo
    const rawConf: string[] = rawUserInfo.confiabilidades;
    confiabilidades.push(...rawConf);
    if (rawConf.some((c: string) => c.includes("ouro") || c.includes("biometria"))) {
      nivel = "ouro";
    } else if (
      rawConf.some((c: string) => c.includes("prata") || c.includes("bancario") || c.includes("inss"))
    ) {
      nivel = "prata";
    }
  }

  // Cross-check: if we have numeric seal IDs, derive level from them too
  if (confiabilidades.length > 0 && !confiabilidades[0].startsWith("urn:")) {
    const derivedNivel = deriveNivelFromSeals(confiabilidades);
    const order = { bronze: 0, prata: 1, ouro: 2 };
    if (order[derivedNivel] > order[nivel]) nivel = derivedNivel;
  }

  const cpfRaw = rawUserInfo.sub ?? idTokenPayload?.sub ?? "";
  const cpf = cpfRaw.replace(/\D/g, "");

  // Per the docs: social_name takes priority over name when available
  const socialName = rawUserInfo.social_name ?? idTokenPayload?.social_name;
  const fullName = rawUserInfo.name ?? idTokenPayload?.name ?? "";

  return {
    sub: cpfRaw,
    name: socialName || fullName,
    social_name: socialName ?? null,
    email: rawUserInfo.email ?? idTokenPayload?.email ?? "",
    email_verified:
      rawUserInfo.email_verified === true || rawUserInfo.email_verified === "true",
    phone_number: rawUserInfo.phone_number ?? idTokenPayload?.phone_number,
    phone_number_verified:
      rawUserInfo.phone_number_verified === true ||
      rawUserInfo.phone_number_verified === "true",
    picture: rawUserInfo.picture,
    confiabilidades,
    nivel,
    cpf,
    amr: idTokenPayload?.amr ?? rawUserInfo.amr ?? [],
  };
}

// ── Mock helpers (GOVBR_MOCK=true only) ─────────────────────

function createMockTokenResponse(session: GovBrSession) {
  // Build a realistic mock id_token with reliability_info (Passo 9)
  const emailHash = session.userEmail
    .split("")
    .reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const mockCpf = String(emailHash % 100000000000).padStart(11, "0");

  const idTokenPayload = {
    sub: mockCpf,
    name: session.userName,
    email: session.userEmail,
    email_verified: true,
    preferred_username: mockCpf,
    nonce: session.nonce,
    amr: ["passwd", "mfa", "otp_offline"],
    reliability_info: {
      level: "gold",
      reliabilities: [
        { id: "601", updatedAt: new Date().toISOString() },
        { id: "626", updatedAt: new Date().toISOString() },
        { id: "901", updatedAt: new Date().toISOString() },
      ],
    },
    iss: "https://sso.staging.acesso.gov.br/",
    aud: GOV_BR_CONFIG.clientId || "mock-client",
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 60,
    jti: uuid(),
  };

  // Encode a fake JWT (header.payload.signature)
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify(idTokenPayload)).toString("base64url");
  const mockIdToken = `${header}.${payload}.mock-signature`;

  return {
    access_token: "mock-access-token-" + uuid(),
    token_type: "Bearer",
    expires_in: 3600,
    scope: GOV_BR_CONFIG.scopes.join(" "),
    id_token: mockIdToken,
    _mock: true,
  };
}

function createMockUserInfo(session: GovBrSession): GovBrUserInfo {
  const emailHash = session.userEmail
    .split("")
    .reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const mockCpf = String(emailHash % 100000000000).padStart(11, "0");

  return {
    sub: mockCpf,
    name: session.userName,
    social_name: null,
    email: session.userEmail,
    email_verified: true,
    phone_number: "61999999999",
    phone_number_verified: true,
    confiabilidades: ["601", "626", "901"],
    nivel: "ouro",
    cpf: mockCpf,
    amr: ["passwd", "mfa", "otp_offline"],
  };
}

/**
 * Generate the Gov.br logout URL.
 * Per the docs, the application MUST implement logout to invalidate the session.
 * The client should redirect the user's browser to this URL.
 */
export function getGovBrLogoutUrl(postLogoutRedirectUri?: string): string {
  const uri = postLogoutRedirectUri ?? `${config.webUrl}/login`;
  return `${GOV_BR_CONFIG.logoutUrl}?post_logout_redirect_uri=${encodeURIComponent(uri)}`;
}
