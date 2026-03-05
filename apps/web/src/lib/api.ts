const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

class ApiClient {
  private token: string | null = null;

  setToken(token: string | null) {
    this.token = token;
    if (typeof window !== "undefined") {
      if (token) localStorage.setItem("itsign_token", token);
      else localStorage.removeItem("itsign_token");
    }
  }

  getToken(): string | null {
    if (this.token) return this.token;
    if (typeof window !== "undefined") {
      this.token = localStorage.getItem("itsign_token");
    }
    return this.token;
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    const h: Record<string, string> = { ...extra };
    const t = this.getToken();
    if (t) h["Authorization"] = `Bearer ${t}`;
    return h;
  }

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
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
  register(input: { organizationName: string; name: string; email: string; password: string }) {
    return this.request<{ accessToken: string; user: any }>("POST", "/v1/auth/register", input);
  }

  login(email: string, password: string) {
    return this.request<{ accessToken: string; user: any }>("POST", "/v1/auth/login", { email, password });
  }

  me() {
    return this.request<any>("GET", "/v1/auth/me");
  }

  // ── Documents ───────────────────────────────────────────
  uploadDocument(file: File) {
    const form = new FormData();
    form.append("file", file);
    return this.request<any>("POST", "/v1/documents", form);
  }

  listDocuments() {
    return this.request<{ data: any[] }>("GET", "/v1/documents");
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

  sign(token: string, input: { signatureData: string; signatureType: string }) {
    return this.request<any>("POST", `/v1/sign/${token}`, input);
  }
}

export const api = new ApiClient();
