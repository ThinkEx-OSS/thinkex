import { getFastAPIClient } from "@/lib/fastapi-client";
import { logger } from "@/lib/utils/logger";

const STORAGE_PATH_PATTERN = /^(uploads\/)?\d+-[a-z0-9]+-[A-Za-z0-9._-]+$/;
const MAX_FILE_PATH_LEN = 512;
const MAX_FILE_URL_LEN = 4096;
const CONVERSION_RETRYABLE_STATUSES = new Set([502, 503, 504]);
const MAX_CONVERSION_ATTEMPTS = 3;
const CONVERSION_RETRY_DELAYS_MS = [1200, 2500];

function isValidStoragePath(filePath: string): boolean {
  return STORAGE_PATH_PATTERN.test(filePath);
}

function isValidLocalFileUrl(fileUrl: string, filePath: string, requestOrigin: string): boolean {
  const expectedUrl = new URL(`/api/files/${filePath}`, requestOrigin);
  return fileUrl === expectedUrl.toString();
}

function isValidSupabaseFileUrl(fileUrl: string, filePath: string): boolean {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return false;

  const expectedUrl = new URL(
    `/storage/v1/object/public/file-upload/${filePath}`,
    supabaseUrl
  );
  return fileUrl === expectedUrl.toString();
}

export function isValidDocumentConversionRequest(
  filePath: string,
  fileUrl: string,
  requestOrigin: string
): boolean {
  if (
    !filePath ||
    !fileUrl ||
    filePath.length > MAX_FILE_PATH_LEN ||
    fileUrl.length > MAX_FILE_URL_LEN
  ) {
    return false;
  }

  if (!isValidStoragePath(filePath)) {
    return false;
  }

  return (
    isValidLocalFileUrl(fileUrl, filePath, requestOrigin) ||
    isValidSupabaseFileUrl(fileUrl, filePath)
  );
}

export async function requestDocumentPdfConversion(
  filePath: string,
  fileUrl: string
): Promise<{ pdfUrl: string; pdfPath: string }> {
  const fastapi = getFastAPIClient();

  for (let attempt = 1; attempt <= MAX_CONVERSION_ATTEMPTS; attempt += 1) {
    const { data, error, status } = await fastapi.post<{
      pdf_url?: string;
      pdf_path?: string;
    }>("api/v1/conversions/document-to-pdf", {
      file_path: filePath,
      file_url: fileUrl,
    });

    if (!error) {
      if (!data?.pdf_url || !data?.pdf_path) {
        throw new Error("Conversion succeeded without returning a PDF URL");
      }

      return {
        pdfUrl: data.pdf_url,
        pdfPath: data.pdf_path,
      };
    }

    const shouldRetry =
      CONVERSION_RETRYABLE_STATUSES.has(status) &&
      attempt < MAX_CONVERSION_ATTEMPTS;

    if (!shouldRetry) {
      throw new Error(error);
    }

    const delayMs =
      CONVERSION_RETRY_DELAYS_MS[attempt - 1] ??
      CONVERSION_RETRY_DELAYS_MS[CONVERSION_RETRY_DELAYS_MS.length - 1];

    logger.warn("[document-conversion] Retrying conversion request after transient FastAPI error", {
      attempt,
      nextAttempt: attempt + 1,
      status,
      delayMs,
      filePath,
      error,
    });

    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  throw new Error("Document conversion failed after retries");
}
