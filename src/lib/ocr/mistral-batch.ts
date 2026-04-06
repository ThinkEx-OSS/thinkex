import { MISTRAL_BBOX_ANNOTATION_FORMAT } from "@/lib/pdf/ocr-figure-inline";
import { logger } from "@/lib/utils/logger";
import { getOcrConfig } from "./config";
import type { OcrCandidate, OcrItemFailureResult, OcrItemResult, OcrItemSuccessResult, OcrPage } from "./types";

const POLL_INTERVAL_MS = 2_000;
const MAX_POLL_MS = 10 * 60 * 1000;

type BatchJobStatus =
  | "QUEUED"
  | "RUNNING"
  | "SUCCESS"
  | "FAILED"
  | "TIMEOUT_EXCEEDED"
  | "CANCELLATION_REQUESTED"
  | "CANCELLED";

interface BatchJobResponse {
  id: string;
  status: BatchJobStatus;
  output_file?: string | null;
  error_file?: string | null;
}

interface BatchOutputLine {
  custom_id?: string;
  response?: {
    status_code?: number;
    body?: {
      pages?: OcrPage[];
    };
  };
  error?: {
    message?: string;
  } | null;
}

function normalizePages(pages: OcrPage[] | undefined): OcrPage[] {
  return (pages ?? []).map((page, index) => ({
    ...page,
    index,
  }));
}

function buildBatchRequest(candidate: OcrCandidate) {
  return {
    custom_id: candidate.itemId,
    body: {
      document:
        candidate.itemType === "image"
          ? { image_url: candidate.fileUrl }
          : { document_url: candidate.fileUrl },
      extract_header: true,
      extract_footer: true,
      bbox_annotation_format: MISTRAL_BBOX_ANNOTATION_FORMAT,
      include_image_base64: false,
    },
  };
}

async function fetchJson<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const text = await response.text();
  const json = text ? (JSON.parse(text) as T) : ({} as T);

  if (!response.ok) {
    throw new Error(
      `Mistral batch request failed (${response.status}): ${text || response.statusText}`
    );
  }

  return json;
}

async function downloadJsonlFile(fileId: string): Promise<BatchOutputLine[]> {
  const { apiBaseUrl, apiKey } = getOcrConfig();
  const response = await fetch(`${apiBaseUrl}/v1/files/${fileId}/content`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Failed to download batch results (${response.status}): ${text || response.statusText}`
    );
  }

  const text = await response.text();
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as BatchOutputLine);
}

export function mapBatchResults(
  candidates: OcrCandidate[],
  outputLines: BatchOutputLine[],
  errorLines: BatchOutputLine[]
): OcrItemResult[] {
  const resultsById = new Map<string, OcrItemResult>();

  outputLines.forEach((line) => {
    if (!line.custom_id) return;
    const candidate = candidates.find((item) => item.itemId === line.custom_id);
    if (!candidate) return;

    if (line.response?.status_code === 200) {
      const successResult: OcrItemSuccessResult = {
        itemId: candidate.itemId,
        itemType: candidate.itemType,
        ok: true,
        pages: normalizePages(line.response.body?.pages),
      };
      resultsById.set(candidate.itemId, successResult);
      return;
    }

    const failureResult: OcrItemFailureResult = {
      itemId: candidate.itemId,
      itemType: candidate.itemType,
      ok: false,
      error:
        line.error?.message ||
        `OCR batch request failed with status ${line.response?.status_code ?? "unknown"}`,
    };
    resultsById.set(candidate.itemId, failureResult);
  });

  errorLines.forEach((line) => {
    if (!line.custom_id || resultsById.has(line.custom_id)) return;
    const candidate = candidates.find((item) => item.itemId === line.custom_id);
    if (!candidate) return;

    resultsById.set(candidate.itemId, {
      itemId: candidate.itemId,
      itemType: candidate.itemType,
      ok: false,
      error: line.error?.message || "OCR batch request failed",
    });
  });

  return candidates.map((candidate) => {
    return (
      resultsById.get(candidate.itemId) ?? {
        itemId: candidate.itemId,
        itemType: candidate.itemType,
        ok: false,
        error: "Batch OCR did not return a result for this item",
      }
    );
  });
}

async function waitForBatchJob(jobId: string): Promise<BatchJobResponse> {
  const { batchJobsEndpoint, apiKey } = getOcrConfig();
  const startedAt = Date.now();

  while (Date.now() - startedAt < MAX_POLL_MS) {
    const job = await fetchJson<BatchJobResponse>(`${batchJobsEndpoint}/${jobId}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
    });

    if (job.status === "SUCCESS") {
      return job;
    }

    if (
      job.status === "FAILED" ||
      job.status === "TIMEOUT_EXCEEDED" ||
      job.status === "CANCELLED"
    ) {
      throw new Error(`Batch OCR job ended with status ${job.status}`);
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error("Timed out while waiting for OCR batch job to complete");
}

export async function runBatchOcr(
  candidates: OcrCandidate[]
): Promise<OcrItemResult[]> {
  const config = getOcrConfig();
  logger.info("[OCR_BATCH] Creating batch OCR job", {
    itemCount: candidates.length,
    itemTypes: candidates.map((candidate) => candidate.itemType),
  });

  const createdJob = await fetchJson<BatchJobResponse>(config.batchJobsEndpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      endpoint: "/v1/ocr",
      requests: candidates.map(buildBatchRequest),
      metadata: {
        job_type: "thinkex-ocr",
      },
    }),
  });

  const completedJob = await waitForBatchJob(createdJob.id);
  const outputLines = completedJob.output_file
    ? await downloadJsonlFile(completedJob.output_file)
    : [];
  const errorLines = completedJob.error_file
    ? await downloadJsonlFile(completedJob.error_file)
    : [];

  return mapBatchResults(candidates, outputLines, errorLines);
}
