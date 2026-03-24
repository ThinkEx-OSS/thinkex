import { logger } from "@/lib/utils/logger";

const MAX_ATTEMPTS_PER_DEPLOYMENT = 4;
const RATE_LIMIT_BASE_DELAY_MS = 20_000;
const RATE_LIMIT_MAX_DELAY_MS = 120_000;
const TIMEOUT_BASE_DELAY_MS = 8_000;
const TIMEOUT_MAX_DELAY_MS = 45_000;
const RETRY_JITTER_MS = 1_500;

interface DeploymentRetryState {
  attempts: number;
  nextAttemptAt: number;
}

interface AzureOcrResponsePage {
  index?: number;
  markdown?: string;
  images?: unknown[];
  footer?: string | null;
  header?: string | null;
  hyperlinks?: unknown[];
  tables?: unknown[];
}

interface AzureOcrResponse {
  pages?: AzureOcrResponsePage[];
  [key: string]: unknown;
}

interface AzureOcrConfig {
  endpoint: string;
  apiKey: string;
  model: string;
}

interface AzureOcrPage {
  index: number;
  markdown: string;
  images?: unknown[];
  footer?: string | null;
  header?: string | null;
  hyperlinks?: unknown[];
  tables?: unknown[];
}

export interface AzureOcrCallResult {
  pages: AzureOcrPage[];
  endpointIndex: number;
}

function mapAzurePages(rawPages: AzureOcrResponsePage[]): AzureOcrPage[] {
  return rawPages.map((p, i) => {
    const page: AzureOcrPage = {
      index: p.index ?? i,
      markdown: p.markdown ?? "",
    };
    if (p.images?.length) page.images = p.images;
    if (p.footer) page.footer = p.footer;
    if (p.header) page.header = p.header;
    if (p.hyperlinks?.length) page.hyperlinks = p.hyperlinks;
    if (p.tables?.length) page.tables = p.tables;
    return page;
  });
}

function parseRetryAfterMs(retryAfter: string | null): number | null {
  if (!retryAfter) return null;

  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }

  const dateMs = Date.parse(retryAfter);
  if (Number.isNaN(dateMs)) return null;

  return Math.max(0, dateMs - Date.now());
}

function parseAzureRetryDelayMs(errorText: string): number | null {
  const match = errorText.match(/Please wait\s+(\d+)\s+seconds?/i);
  if (!match) return null;

  const seconds = Number(match[1]);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;

  return seconds * 1000;
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
      parseRetryAfterMs(retryAfter) ?? parseAzureRetryDelayMs(errorText);
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

export async function callAzureOcr(
  pool: AzureOcrConfig[],
  baseBody: Record<string, unknown>,
  errorLabel: string,
  logLabel: string
): Promise<AzureOcrCallResult> {
  if (pool.length === 0) {
    throw new Error(
      "AZURE_DOCUMENT_AI_API_KEY and AZURE_DOCUMENT_AI_ENDPOINT must be set"
    );
  }

  const states: DeploymentRetryState[] = pool.map(() => ({
    attempts: 0,
    nextAttemptAt: 0,
  }));
  const start = Math.floor(Math.random() * pool.length);
  let lastError: Error | null = null;

  while (true) {
    let attemptedRequest = false;
    let nextReadyAt = Number.POSITIVE_INFINITY;

    for (let deployIdx = 0; deployIdx < pool.length; deployIdx++) {
      const actualIdx = (start + deployIdx) % pool.length;
      const state = states[actualIdx];

      if (state.attempts >= MAX_ATTEMPTS_PER_DEPLOYMENT) {
        continue;
      }

      const now = Date.now();
      if (state.nextAttemptAt > now) {
        nextReadyAt = Math.min(nextReadyAt, state.nextAttemptAt);
        continue;
      }

      attemptedRequest = true;
      state.attempts += 1;

      const { endpoint, apiKey, model } = pool[actualIdx];
      const endpointIndex = actualIdx;
      const body = { ...baseBody, model };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const json = (await res.json()) as AzureOcrResponse;
        return {
          pages: mapAzurePages(json.pages ?? []),
          endpointIndex,
        };
      }

      const retryAfter = res.headers.get("retry-after");
      const errText = await res.text();
      lastError = new Error(`${errorLabel} (${res.status}): ${errText}`);

      if (res.status !== 408 && res.status !== 429) {
        throw lastError;
      }

      if (state.attempts >= MAX_ATTEMPTS_PER_DEPLOYMENT) {
        logger.warn(`${logLabel} Exhausted retries for deployment`, {
          deployIdx: actualIdx,
          attempt: state.attempts,
          status: res.status,
        });
        continue;
      }

      const delayMs = getRetryDelayMs(
        res.status,
        state.attempts - 1,
        errText,
        retryAfter
      );
      state.nextAttemptAt = Date.now() + delayMs;
      nextReadyAt = Math.min(nextReadyAt, state.nextAttemptAt);

      logger.warn(`${logLabel} Scheduled retry`, {
        deployIdx: actualIdx,
        attempt: state.attempts,
        maxAttemptsPerDeployment: MAX_ATTEMPTS_PER_DEPLOYMENT,
        status: res.status,
        delayMs: Math.round(delayMs),
      });
    }

    const hasRemainingAttempts = states.some(
      (state) => state.attempts < MAX_ATTEMPTS_PER_DEPLOYMENT
    );
    if (!hasRemainingAttempts || !lastError) {
      break;
    }

    if (!attemptedRequest && Number.isFinite(nextReadyAt)) {
      const delayMs = Math.max(250, nextReadyAt - Date.now());
      logger.info(`${logLabel} Waiting for deployment cooldown`, {
        delayMs: Math.round(delayMs),
      });
      await sleepMs(delayMs);
    }
  }

  throw lastError ?? new Error(`${errorLabel}: exhausted OCR retries`);
}
