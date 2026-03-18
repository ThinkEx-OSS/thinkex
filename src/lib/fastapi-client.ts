import { logger } from "@/lib/utils/logger";

/**
 * Client for communicating with the external FastAPI service.
 * Used for file conversion, doc-to-markdown, audio/video analysis, etc.
 *
 * All requests include Bearer token (FASTAPI_API_KEY) for server-to-server auth.
 * Use only from Next.js API routes / server-side code.
 */
export class FastAPIClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(config?: { baseUrl?: string; apiKey?: string }) {
    this.baseUrl =
      config?.baseUrl ||
      process.env.FASTAPI_BASE_URL ||
      "http://localhost:8000";
    this.apiKey = config?.apiKey || process.env.FASTAPI_API_KEY || "";

    if (!this.apiKey) {
      logger.warn(
        "⚠️ [FastAPI] No API key provided. FastAPI features will be disabled."
      );
    }
  }

  /**
   * Generic request method. Use for any FastAPI endpoint.
   */
  async request<T>(
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    path: string,
    options?: {
      body?: unknown;
      headers?: Record<string, string>;
      signal?: AbortSignal;
    }
  ): Promise<{ data?: T; error?: string; status: number }> {
    if (!this.apiKey) {
      return { error: "FastAPI API key not configured", status: 500 };
    }

    const url = `${this.baseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;

    try {
      logger.debug(`[FastAPI] ${method} ${url}`);

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
          ...options?.headers,
        },
        body: options?.body ? JSON.stringify(options.body) : undefined,
        signal: options?.signal,
      });

      const text = await response.text();
      let data: T | undefined;

      try {
        data = text ? (JSON.parse(text) as T) : undefined;
      } catch {
        // Non-JSON response (e.g. file download)
        data = text as unknown as T;
      }

      if (!response.ok) {
        const errorMsg =
          typeof data === "object" && data !== null && "detail" in data
            ? String((data as { detail?: unknown }).detail)
            : text || response.statusText;
        logger.error(`[FastAPI] ${method} ${path} failed:`, response.status, errorMsg);
        return {
          error: errorMsg || `FastAPI error: ${response.status}`,
          status: response.status,
          data,
        };
      }

      return { data, status: response.status };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`[FastAPI] Request failed ${method} ${path}:`, message);
      return {
        error: message,
        status: 500,
      };
    }
  }

  /** GET request shorthand */
  async get<T>(path: string, options?: { headers?: Record<string, string> }) {
    return this.request<T>("GET", path, options);
  }

  /** POST request shorthand */
  async post<T>(
    path: string,
    body?: unknown,
    options?: { headers?: Record<string, string> }
  ) {
    return this.request<T>("POST", path, { ...options, body });
  }
}

/** Singleton instance for use in API routes */
let _client: FastAPIClient | null = null;

export function getFastAPIClient(): FastAPIClient {
  if (!_client) {
    _client = new FastAPIClient();
  }
  return _client;
}
