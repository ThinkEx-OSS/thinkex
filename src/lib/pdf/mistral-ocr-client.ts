import { mergeFigureAnnotationsIntoMarkdown } from "@/lib/pdf/ocr-figure-inline";
import { logger } from "@/lib/utils/logger";
const MAX_ATTEMPTS = 4;
const RATE_LIMIT_BASE_DELAY_MS = 20_000;
const RATE_LIMIT_MAX_DELAY_MS = 120_000;
const TIMEOUT_BASE_DELAY_MS = 8_000;
const TIMEOUT_MAX_DELAY_MS = 45_000;
const RETRY_JITTER_MS = 1_500;

interface MistralOcrResponseImage {
  id?: string;
  image_annotation?: string | null;
}

interface MistralOcrResponsePage {
  index?: number;
  markdown?: string;
  footer?: string | null;
  header?: string | null;
  hyperlinks?: unknown[];
  tables?: unknown[];
  /** Present when bbox annotations are enabled; merged into markdown and not stored on OcrPage. */
  images?: MistralOcrResponseImage[];
}

export interface MistralOcrResponse {
  pages?: MistralOcrResponsePage[];
  [key: string]: unknown;
}

export interface MistralOcrConfig {
  ocrEndpoint: string;
  apiKey: string;
  model: string;
}

export interface MistralOcrPage {
  index: number;
  markdown: string;
  footer?: string | null;
  header?: string | null;
  hyperlinks?: unknown[];
  tables?: unknown[];
}

export interface MistralOcrCallResult {
  pages: MistralOcrPage[];
}

export function mapPages(rawPages: MistralOcrResponsePage[]): MistralOcrPage[] {
  return rawPages.map((page, index) => {
    const rawMd = page.markdown ?? "";
    const markdown = mergeFigureAnnotationsIntoMarkdown(rawMd, page.images);
    const mapped: MistralOcrPage = {
      index: page.index ?? index,
      markdown,
    };
    if (page.footer) mapped.footer = page.footer;
    if (page.header) mapped.header = page.header;
    if (page.hyperlinks?.length) mapped.hyperlinks = page.hyperlinks;
    if (page.tables?.length) mapped.tables = page.tables;
    return mapped;
  });
}

export function getDocumentMetadata(baseBody: Record<string, unknown>) {
  const document = (baseBody.document ?? {}) as Record<string, unknown>;
  const documentType = typeof document.type === "string" ? document.type : "unknown";
  const documentUrl =
    typeof document.document_url === "string"
      ? document.document_url
      : typeof document.image_url === "string"
        ? document.image_url
        : null;
  const documentUrlPreview = documentUrl
    ? documentUrl.startsWith("data:")
      ? `${documentUrl.slice(0, 32)}...`
      : documentUrl
    : null;
  const documentHost = documentUrl && !documentUrl.startsWith("data:")
    ? (() => {
        try {
          return new URL(documentUrl).host;
        } catch {
          return "invalid-url";
        }
      })()
    : null;

  return {
    documentHost,
    documentType,
    documentUrlPreview,
  };
}

function parseRetryAfterMs(retryAfter: string | null): number | null {
  if (!retryAfter) return null;

  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1_000;
  }

  const dateMs = Date.parse(retryAfter);
  if (Number.isNaN(dateMs)) return null;

  return Math.max(0, dateMs - Date.now());
}

function parseProviderRetryDelayMs(errorText: string): number | null {
  const match = errorText.match(/Please wait\s+(\d+)\s+seconds?/i);
  if (!match) return null;

  const seconds = Number(match[1]);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;

  return seconds * 1_000;
}

function getRetryDelayMs(
  status: number,
  attempt: number,
  errorText: string,
  retryAfter: string | null
): number {
  const jitterMs = Math.random() * RETRY_JITTER_MS;

  if (status === 429) {
    const serverDelayMs =
      parseRetryAfterMs(retryAfter) ?? parseProviderRetryDelayMs(errorText);
    const baseDelayMs = Math.max(
      RATE_LIMIT_BASE_DELAY_MS,
      serverDelayMs ?? RATE_LIMIT_BASE_DELAY_MS
    );
    const delayMs = Math.min(
      RATE_LIMIT_MAX_DELAY_MS,
      Math.round(baseDelayMs * Math.pow(1.75, attempt))
    );
    return delayMs + jitterMs;
  }

  const delayMs = Math.min(
    TIMEOUT_MAX_DELAY_MS,
    Math.round(TIMEOUT_BASE_DELAY_MS * Math.pow(2, attempt))
  );
  return delayMs + jitterMs;
}

async function sleepMs(delayMs: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}

export async function callMistralOcr(
  config: MistralOcrConfig,
  baseBody: Record<string, unknown>,
  errorLabel: string,
  logLabel: string
): Promise<MistralOcrCallResult> {
  const { ocrEndpoint, apiKey, model } = config;
  const { documentHost, documentType, documentUrlPreview } =
    getDocumentMetadata(baseBody);

  if (!apiKey) {
    throw new Error("MISTRAL_API_KEY must be set");
  }

  logger.info(`${logLabel} Request init`, {
    endpoint: ocrEndpoint,
    model,
    documentType,
    documentHost,
    documentUrlPreview,
  });

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const body = { ...baseBody, model };
    const startedAt = Date.now();
    let response: Response;

    logger.info(`${logLabel} Request start`, {
      attempt,
      maxAttempts: MAX_ATTEMPTS,
      endpoint: ocrEndpoint,
      model,
      documentType,
      documentHost,
      mode: "direct",
    });

    try {
      response = await fetch(ocrEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });
    } catch (error) {
      const durationMs = Date.now() - startedAt;

      lastError =
        error instanceof Error ? error : new Error(String(error ?? errorLabel));
      logger.error(`${logLabel} Request failed before response`, {
        attempt,
        durationMs,
        endpoint: ocrEndpoint,
        model,
        documentType,
        documentHost,
        error:
          error instanceof Error
            ? { name: error.name, message: error.message }
            : String(error),
      });

      if (attempt >= MAX_ATTEMPTS) break;

      const delayMs = getRetryDelayMs(408, attempt - 1, lastError.message, null);
      logger.warn(`${logLabel} Scheduled retry after network failure`, {
        attempt,
        maxAttempts: MAX_ATTEMPTS,
        delayMs: Math.round(delayMs),
      });
      await sleepMs(delayMs);
      continue;
    }

    const durationMs = Date.now() - startedAt;
    logger.info(`${logLabel} Response received`, {
      attempt,
      status: response.status,
      ok: response.ok,
      durationMs,
    });

    if (response.ok) {
      const json = (await response.json()) as MistralOcrResponse;
      logger.info(`${logLabel} OCR success`, {
        attempt,
        durationMs,
        pageCount: json.pages?.length ?? 0,
      });
      return {
        pages: mapPages(json.pages ?? []),
      };
    }

    const retryAfter = response.headers.get("retry-after");
    const errText = await response.text();
    lastError = new Error(`${errorLabel} (${response.status}): ${errText}`);
    logger.warn(`${logLabel} OCR error response`, {
      attempt,
      status: response.status,
      retryAfter,
      durationMs,
      errorTextPreview: errText.slice(0, 500),
    });

    if (response.status !== 408 && response.status !== 429) {
      throw lastError;
    }

    if (attempt >= MAX_ATTEMPTS) {
      logger.warn(`${logLabel} Exhausted OCR retries`, {
        attempt,
        status: response.status,
      });
      break;
    }

    const delayMs = getRetryDelayMs(
      response.status,
      attempt - 1,
      errText,
      retryAfter
    );
    logger.warn(`${logLabel} Scheduled retry`, {
      attempt,
      maxAttempts: MAX_ATTEMPTS,
      status: response.status,
      delayMs: Math.round(delayMs),
    });
    await sleepMs(delayMs);
  }

  throw lastError ?? new Error(`${errorLabel}: exhausted OCR retries`);
}
