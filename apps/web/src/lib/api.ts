const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

class ApiClient {
  private token: string | null = null;

  setToken(token: string | null) {
    this.token = token;
  }

  getToken(): string | null {
    return this.token;
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    const h: Record<string, string> = { ...extra };
    const t = this.getToken();
    if (t) h["Authorization"] = `Bearer ${t}`;
    return h;
  }

  private async refreshAuthToken(): Promise<string | null> {
    try {
      const { auth } = await import("./firebase");
      const currentUser = auth.currentUser;
      if (!currentUser) return null;
      const refreshedToken = await currentUser.getIdToken(true);
      this.setToken(refreshedToken);
      return refreshedToken;
    } catch {
      return null;
    }
  }

  async request<T>(method: string, path: string, body?: unknown, allowRetry = true): Promise<T> {
    const contentHeaders: Record<string, string> =
      body != null && !(body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {};
    const opts: RequestInit = {
      method,
      headers: this.headers(contentHeaders),
    };
    if (body != null) {
      opts.body = body instanceof FormData ? body : JSON.stringify(body);
    }
    const res = await fetch(`${API_URL}${path}`, opts);
    let data: any;
    try {
      data = await res.json();
    } catch {
      if (!res.ok) throw new Error(`Erro ${res.status}: ${res.statusText}`);
      data = {};
    }
    if (res.status === 401 && this.getToken() && allowRetry) {
      const refreshedToken = await this.refreshAuthToken();
      if (refreshedToken) {
        return this.request<T>(method, path, body, false);
      }
    }
    if (!res.ok) {
      const msg = data?.message ?? data?.error ?? `Erro ${res.status}`;
      const err = new Error(msg);
      (err as any).details = data?.details;
      (err as any).statusCode = data?.statusCode ?? res.status;
      throw err;
    }
    return data as T;
  }

  // ── Auth ────────────────────────────────────────────────
  register(input: { organizationName: string; name: string; email: string }) {
    return this.request<{ user: any }>("POST", "/v1/auth/register", input);
  }

  me() {
    return this.request<any>("GET", "/v1/auth/me");
  }

  updateProfile(data: { name?: string }) {
    return this.request<any>("PATCH", "/v1/auth/me", data);
  }

  // ── Documents ───────────────────────────────────────────
  uploadDocument(file: File) {
    const form = new FormData();
    form.append("file", file);
    return this.request<any>("POST", "/v1/documents", form);
  }

  getDocumentFormFields(documentId: string) {
    return this.request<{ data: any[] }>("GET", `/v1/documents/${documentId}/form-fields`);
  }

  listDocuments() {
    return this.request<{ data: any[] }>("GET", "/v1/documents");
  }

  // ── Download document (authenticated) ───────────────────
  async downloadDocument(documentId: string) {
    const res = await fetch(`${API_URL}/v1/documents/${documentId}/download`, {
      headers: this.headers(),
    });
    if (!res.ok) throw new Error(`Erro ao baixar documento: ${res.status}`);
    const blob = await res.blob();
    const contentDisposition = res.headers.get("Content-Disposition") ?? "";
    const match = contentDisposition.match(/filename="?(.+?)"?$/);
    const fileName = match ? decodeURIComponent(match[1]) : "documento.pdf";
    return { blob, fileName };
  }

  // ── Download signed document (public, token-based) ──────
  async downloadSignedDocument(token: string) {
    const res = await fetch(`${API_URL}/v1/sign/${token}/download`);
    if (!res.ok) throw new Error(`Erro ao baixar documento: ${res.status}`);
    const blob = await res.blob();
    const contentDisposition = res.headers.get("Content-Disposition") ?? "";
    const match = contentDisposition.match(/filename="?(.+?)"?$/);
    const fileName = match ? decodeURIComponent(match[1]) : "documento.pdf";
    return { blob, fileName };
  }

  // ── Envelopes ───────────────────────────────────────────
  createEnvelope(input: {
    title: string;
    documentId: string;
    recipients: Array<{ name: string; email: string; role: string; signingOrder: number }>;
    expiresAt?: string;
  }) {
    return this.request<any>("POST", "/v1/envelopes", input);
  }

  listEnvelopes(page = 1, pageSize = 20) {
    return this.request<{ data: any[]; total: number; page: number; pageSize: number }>(
      "GET",
      `/v1/envelopes?page=${page}&pageSize=${pageSize}`
    );
  }

  getEnvelope(id: string) {
    return this.request<any>("GET", `/v1/envelopes/${id}`);
  }

  sendEnvelope(id: string) {
    return this.request<any>("POST", `/v1/envelopes/${id}/send`);
  }

  cancelEnvelope(id: string) {
    return this.request<any>("POST", `/v1/envelopes/${id}/cancel`);
  }

  // ── Signing (public) ───────────────────────────────────
  getSigningInfo(token: string) {
    return this.request<any>("GET", `/v1/sign/${token}`);
  }

  sign(token: string, input: {
    signatureData: string;
    signatureType: string;
    signaturePosition?: { page: number; x: number; y: number; width: number; height: number };
    formFields?: Record<string, string | boolean | string[]>;
    overlayFields?: Array<{
      id?: string;
      type: "text" | "check" | "cross" | "dot";
      page: number;
      x: number;
      y: number;
      width: number;
      height: number;
      value?: string;
    }>;
  }) {
    return this.request<any>("POST", `/v1/sign/${token}`, input);
  }

  // ── Certificate / ICP-Brasil ──────────────────────────
  validateCertificate(pfxFile: File, password: string) {
    const form = new FormData();
    form.append("file", pfxFile);
    form.append("password", password);
    return this.request<{ certificate: any; validation: any }>("POST", "/v1/certificates/validate", form);
  }

  signWithCertificate(input: {
    certificateFile: File;
    password: string;
    recipientToken: string;
    envelopeId: string;
    signaturePosition?: { page: number; x: number; y: number; width: number; height: number };
    formFields?: Record<string, string | boolean | string[]>;
    overlayFields?: Array<{
      id?: string;
      type: "text" | "check" | "cross" | "dot";
      page: number;
      x: number;
      y: number;
      width: number;
      height: number;
      value?: string;
    }>;
  }) {
    const form = new FormData();
    form.append("certificate", input.certificateFile);
    form.append("password", input.password);
    form.append("recipientToken", input.recipientToken);
    form.append("envelopeId", input.envelopeId);
    if (input.signaturePosition) {
      form.append("signaturePosition", JSON.stringify(input.signaturePosition));
    }
    if (input.formFields) {
      form.append("formFields", JSON.stringify(input.formFields));
    }
    if (input.overlayFields) {
      form.append("overlayFields", JSON.stringify(input.overlayFields));
    }
    return this.request<{
      signed: boolean;
      envelopeCompleted: boolean;
      recipientId: string;
      verificationCode: string | null;
      certificate: {
        commonName: string;
        cpf: string | null;
        cnpj: string | null;
        issuer: string;
        isIcpBrasil: boolean;
        certType: string;
        signatureLevel: string;
      };
      warnings: string[];
    }>("POST", "/v1/sign-with-certificate", form);
  }

  // ── Verification (public) ──────────────────────────────
  verifyDocument(code: string) {
    return this.request<any>("GET", `/v1/verify/${code}`);
  }

  getEnvelopeVerification(envelopeId: string) {
    return this.request<{ verificationCode: string }>("GET", `/v1/envelopes/${envelopeId}/verification`);
  }

  // ── Gov.br ────────────────────────────────────────────
  govbrAuthorize(input: {
    envelopeId?: string;
    recipientToken?: string;
    documentTitle?: string;
    returnPath?: string;
  }) {
    return this.request<{ authUrl: string; sessionId: string }>("POST", "/v1/govbr/authorize", input);
  }

  /** Public authorize — for recipients without a login */
  govbrPublicAuthorize(input: { recipientToken: string; returnPath?: string }) {
    return this.request<{ authUrl: string; sessionId: string }>("POST", "/v1/govbr/public-authorize", input);
  }

  govbrSession(sessionId: string) {
    return this.request<{
      sessionId: string;
      status: string;
      user: { name: string; cpf: string; email: string; nivel: string } | null;
    }>("GET", `/v1/govbr/session/${sessionId}`);
  }

  govbrSign(
    sessionId: string,
    recipientToken: string,
    signaturePosition?: { page: number; x: number; y: number; width: number; height: number },
    formFields?: Record<string, string | boolean | string[]>,
    overlayFields?: Array<{
      id?: string;
      type: "text" | "check" | "cross" | "dot";
      page: number;
      x: number;
      y: number;
      width: number;
      height: number;
      value?: string;
    }>
  ) {
    return this.request<{
      signed: boolean;
      envelopeCompleted: boolean;
      recipientId: string;
      verificationCode: string | null;
      govbr: {
        name: string;
        cpf: string;
        nivel: string;
        signatureLevel: string;
        legalBasis: string;
      };
    }>("POST", `/v1/govbr/sign/${sessionId}`, {
      recipientToken,
      signaturePosition: signaturePosition ?? null,
      formFields,
      overlayFields,
    });
  }

  /** Quick-sign: mock mode only (GOVBR_MOCK=true). For real mode, use govbrAuthorize + govbrSign */
  govbrQuickSign(
    recipientToken: string,
    formFields?: Record<string, string | boolean | string[]>,
    overlayFields?: Array<{
      id?: string;
      type: "text" | "check" | "cross" | "dot";
      page: number;
      x: number;
      y: number;
      width: number;
      height: number;
      value?: string;
    }>
  ) {
    return this.request<{
      signed: boolean;
      envelopeCompleted: boolean;
      recipientId: string;
      verificationCode: string | null;
      govbr: {
        name: string;
        cpf: string;
        nivel: string;
        signatureLevel: string;
        legalBasis: string;
      };
    }>("POST", "/v1/govbr/quick-sign", { recipientToken, formFields, overlayFields });
  }
}

export const api = new ApiClient();
