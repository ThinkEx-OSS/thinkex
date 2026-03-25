const DEFAULT_MODEL = "mistral-ocr-latest";
const DEFAULT_OCR_ENDPOINT = "https://api.mistral.ai/v1/ocr";

export interface OcrConfig {
  apiBaseUrl: string;
  endpoint: string;
  ocrEndpoint: string;
  batchJobsEndpoint: string;
  apiKey: string;
  model: string;
}

export function getOcrConfig(): OcrConfig {
  const apiKey = process.env.MISTRAL_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("MISTRAL_API_KEY is required for Mistral OCR");
  }

  const ocrEndpoint = process.env.MISTRAL_OCR_ENDPOINT ?? DEFAULT_OCR_ENDPOINT;
  const apiBaseUrl = new URL(ocrEndpoint).origin;

  return {
    apiBaseUrl,
    endpoint: ocrEndpoint,
    ocrEndpoint,
    batchJobsEndpoint: `${apiBaseUrl}/v1/batch/jobs`,
    apiKey,
    model: process.env.MISTRAL_OCR_MODEL ?? DEFAULT_MODEL,
  };
}
