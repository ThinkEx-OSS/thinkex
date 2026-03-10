/**
 * Azure Mistral Document AI OCR for PDFs.
 * Splits PDFs into page batches (30 MB cap), processes in parallel, merges results.
 * Chunk size is adaptive: smaller for few-page PDFs (max parallelism), larger for big PDFs (fewer API calls).
 */

import { PDFDocument } from "pdf-lib";
import { logger } from "@/lib/utils/logger";

const MAX_BATCH_SIZE_BYTES = 30 * 1024 * 1024; // 30 MB
/** Max concurrent OCR requests; scale with deployment count (3 per deployment with round-robin) */
const MAX_CONCURRENT_OCR = 9;

function isBboxAnnotationEnabled(): boolean {
  return process.env.OCR_BBOX_ANNOTATION !== "false";
}
const DEFAULT_MODEL = "mistral-document-ai-2512";

/** Azure annotations (bbox/document) are limited to 8 pages per request. */
const MAX_PAGES_WITH_ANNOTATION = 8;

/** OCR config: same endpoint/key, model selects deployment. Each deployment has its own rate limit. */
interface OcrConfig {
  endpoint: string;
  apiKey: string;
  model: string;
}

/** Round-robin index for distributing OCR calls across deployments */
let ocrConfigIndex = 0;

/**
 * Collect OCR configs from env. Azure Mistral Document AI uses ONE endpoint/key;
 * deployment is selected via the "model" field in the request body.
 * Primary: AZURE_DOCUMENT_AI_MODEL (default). Additional: AZURE_DOCUMENT_AI_MODEL_2, MODEL_3, etc.
 */
function getOcrConfigs(): OcrConfig[] {
  const endpoint = process.env.AZURE_DOCUMENT_AI_ENDPOINT;
  const apiKey = process.env.AZURE_DOCUMENT_AI_API_KEY;
  const defaultModel = process.env.AZURE_DOCUMENT_AI_MODEL ?? DEFAULT_MODEL;

  if (!endpoint || !apiKey) return [];

  const configs: OcrConfig[] = [];

  // Primary deployment
  configs.push({ endpoint, apiKey, model: defaultModel });

  // Additional deployments: MODEL_2, MODEL_3, ... (same endpoint/key, different model = different deployment)
  for (let i = 2; i <= 10; i++) {
    const model = process.env[`AZURE_DOCUMENT_AI_MODEL_${i}`];
    if (model) {
      configs.push({ endpoint, apiKey, model });
    }
  }

  return configs;
}

/** Get next config from pool (round-robin). Returns config + index for observability. */
function getNextOcrConfig(): OcrConfig & { index: number } {
  const pool = getOcrConfigs();
  if (pool.length === 0) {
    throw new Error("AZURE_DOCUMENT_AI_API_KEY and AZURE_DOCUMENT_AI_ENDPOINT must be set");
  }
  const idx = ocrConfigIndex++ % pool.length;
  return { ...pool[idx], index: idx };
}

/**
 * Choose chunk size based on total page count.
 * Small PDFs: 1 page per chunk (max parallelism).
 * Large PDFs: bigger chunks to reduce API calls and rate-limit risk.
 * When bbox annotation is enabled, caps at 8 pages (Azure/Mistral limit).
 */
function getMaxPagesPerChunk(pageCount: number, withBboxAnnotation: boolean): number {
  const base = (() => {
    if (pageCount <= 10) return 1;
    if (pageCount <= 30) return 3;
    if (pageCount <= 100) return 6;
    return 12;
  })();
  if (withBboxAnnotation && base > MAX_PAGES_WITH_ANNOTATION) {
    return MAX_PAGES_WITH_ANNOTATION;
  }
  return base;
}

/** Rich OCR page data from Azure Document AI (stored in PdfData.ocrPages). Dimensions omitted. */
export interface OcrPage {
  index: number;
  markdown: string;
  images?: unknown[];
  footer?: string | null;
  header?: string | null;
  hyperlinks?: unknown[];
  tables?: unknown[];
}

/**
 * Rewrite image IDs to be globally unique across merged chunks.
 * Azure returns chunk-relative IDs (e.g. img-0 per chunk), so without this,
 * page 0 and page 5 could both have img-0.jpeg → wrong image when resolving refs.
 */
export function rewriteOcrPageImageIds(
  page: OcrPage,
  globalPageIndex: number
): OcrPage {
  const images = page.images as Array<{ id?: string; [key: string]: unknown }> | undefined;
  if (!images?.length)
    return { ...page, index: globalPageIndex };

  const idMap: Record<string, string> = {};
  const newImages = images.map((img, i) => {
    const oldId = (img.id ?? `img-${i}`).toString();
    const newId = `p${globalPageIndex}-${oldId}`;
    idMap[oldId] = newId;
    return { ...img, id: newId };
  });

  let markdown = page.markdown ?? "";
  for (const [oldId, newId] of Object.entries(idMap)) {
    const escaped = oldId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    markdown = markdown.replace(new RegExp(escaped, "g"), newId);
  }

  return {
    ...page,
    index: globalPageIndex,
    images: newImages,
    markdown,
  };
}

export interface OcrResult {
  pages: OcrPage[];
  textContent: string;
}

/** Azure OCR API response schema (pages array from Document AI) */
interface AzureOcrResponsePage {
  index?: number;
  markdown?: string;
  images?: unknown[];
  footer?: string | null;
  header?: string | null;
  hyperlinks?: unknown[];
  tables?: unknown[];
  dimensions?: { dpi?: number; height?: number; width?: number };
}

interface AzureOcrResponse {
  pages?: AzureOcrResponsePage[];
  [key: string]: unknown;
}

/** Result of ocrSingleChunk including endpoint index for observability */
export interface OcrChunkResult {
  pages: OcrPage[];
  endpointIndex: number;
}

/**
 * Call Azure Document AI OCR endpoint with a base64-encoded PDF chunk.
 * Round-robins the model parameter across deployments (same endpoint/key).
 * Returns pages + endpointIndex for workflow observability.
 * Exported for use in workflow steps (single chunk = single step).
 */
export async function ocrSingleChunk(base64Pdf: string): Promise<OcrChunkResult> {
  const documentUrl = `data:application/pdf;base64,${base64Pdf}`;
  const includeImages = process.env.OCR_INCLUDE_IMAGES === "true";
  const bboxAnnotation = isBboxAnnotationEnabled();

  const baseBody: Record<string, unknown> = {
    document: {
      type: "document_url",
      document_name: "chunk",
      document_url: documentUrl,
    },
    include_image_base64: includeImages,
    table_format: null,
  };

  if (bboxAnnotation) {
    baseBody.bbox_annotation_format = {
      type: "json_schema",
      json_schema: {
        schema: {
          properties: { description: { type: "string" } },
          required: ["description"],
          type: "object",
          additionalProperties: false,
        },
        name: "bbox_annotation",
        strict: true,
      },
    };
  }

  const pool = getOcrConfigs();
  if (pool.length === 0) {
    throw new Error("AZURE_DOCUMENT_AI_API_KEY and AZURE_DOCUMENT_AI_ENDPOINT must be set");
  }

  const maxAttempts = pool.length > 1 ? pool.length + 1 : 2;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { endpoint, apiKey, model, index: endpointIndex } = getNextOcrConfig();
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
      const rawPages = json.pages ?? [];

      const pages = rawPages.map((p, i) => {
        const page: OcrPage = {
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
      return { pages, endpointIndex };
    }

    const errText = await res.text();
    lastError = new Error(`Azure OCR failed (${res.status}): ${errText}`);

    if (res.status === 408 || res.status === 429) {
      const delayMs = 3000 * (attempt + 1);
      logger.warn("[PDF_OCR_AZURE] Retry after", res.status, {
        attempt,
        delayMs,
        endpointIndex,
      });
      await new Promise((r) => setTimeout(r, delayMs));
    } else {
      throw lastError;
    }
  }
  throw lastError;
}

/**
 * Split a PDF buffer into page chunks. Respects maxPages and ~30 MB per batch.
 */
function getChunkRanges(
  pageCount: number,
  buffer: Buffer,
  maxPages: number
): number[][] {
  if (pageCount <= maxPages) {
    return [[0, pageCount - 1]];
  }

  const ranges: number[][] = [];
  const avgBytesPerPage = buffer.length / pageCount;
  const maxPagesForSize = Math.max(
    1,
    Math.floor(MAX_BATCH_SIZE_BYTES / avgBytesPerPage)
  );
  const effectiveMaxPages = Math.min(maxPages, maxPagesForSize);

  for (let start = 0; start < pageCount; start += effectiveMaxPages) {
    const end = Math.min(start + effectiveMaxPages, pageCount) - 1;
    ranges.push([start, end]);
  }
  return ranges;
}

/** Chunk spec for workflow steps - each chunk is a separate OCR step */
export interface OcrChunkSpec {
  start: number;
  end: number;
  base64: string;
}

/**
 * Load PDF, compute chunk ranges, extract each chunk to base64.
 * Returns chunk specs for workflow steps (avoids passing full PDF to each step).
 */
export async function prepareOcrChunks(buffer: Buffer): Promise<{
  pageCount: number;
  chunks: OcrChunkSpec[];
}> {
  const doc = await PDFDocument.load(buffer);
  const pageCount = doc.getPageCount();
  if (pageCount === 0) {
    return { pageCount: 0, chunks: [] };
  }

  const maxPages = getMaxPagesPerChunk(pageCount, isBboxAnnotationEnabled());
  const ranges = getChunkRanges(pageCount, buffer, maxPages);

  const chunks: OcrChunkSpec[] = [];
  for (const [start, end] of ranges) {
    const base64 = await extractChunkAsBase64(doc, start, end);
    chunks.push({ start, end, base64 });
  }
  return { pageCount, chunks };
}

/**
 * Extract a page range from a PDF as a new PDF buffer (base64).
 */
async function extractChunkAsBase64(
  sourceDoc: PDFDocument,
  startIndex: number,
  endIndex: number
): Promise<string> {
  const indices: number[] = [];
  for (let i = startIndex; i <= endIndex; i++) indices.push(i);

  const chunkDoc = await PDFDocument.create();
  const copiedPages = await chunkDoc.copyPages(sourceDoc, indices);
  for (const page of copiedPages) chunkDoc.addPage(page);

  const bytes = await chunkDoc.save();
  return Buffer.from(bytes).toString("base64");
}

/**
 * Run OCR on a PDF buffer. Splits into batches; chunk size adapts to page count.
 */
export async function ocrPdfFromBuffer(
  buffer: Buffer,
  options?: { maxPagesPerBatch?: number }
): Promise<OcrResult> {
  const t0 = Date.now();

  const doc = await PDFDocument.load(buffer);
  const pageCount = doc.getPageCount();

  if (pageCount === 0) {
    return { pages: [], textContent: "" };
  }

  const maxPages =
    options?.maxPagesPerBatch ?? getMaxPagesPerChunk(pageCount, isBboxAnnotationEnabled());
  const ranges = getChunkRanges(pageCount, buffer, maxPages);

  logger.info("[PDF_OCR_AZURE] Start", {
    pageCount,
    totalChunks: ranges.length,
    pagesPerChunk: maxPages,
    totalBytes: buffer.length,
    totalBytesMB: (buffer.length / (1024 * 1024)).toFixed(2),
  });

  // Process in batches of MAX_CONCURRENT_OCR to avoid 408 timeouts from flooding Azure
  const chunkResults: Array<{ start: number; end: number; pages: OcrPage[] }> = [];
  for (let i = 0; i < ranges.length; i += MAX_CONCURRENT_OCR) {
    const batch = ranges.slice(i, i + MAX_CONCURRENT_OCR);
    const batchIndex = Math.floor(i / MAX_CONCURRENT_OCR) + 1;
    const totalBatches = Math.ceil(ranges.length / MAX_CONCURRENT_OCR);

    logger.info("[PDF_OCR_AZURE] Batch start", {
      batch: `${batchIndex}/${totalBatches}`,
      chunks: batch.map(([s, e]) => `pages ${s}-${e}`),
    });

    const batchT0 = Date.now();
    const batchResults = await Promise.all(
      batch.map(async ([start, end]) => {
        const base64 = await extractChunkAsBase64(doc, start, end);
        const chunkSizeKB = (Buffer.byteLength(base64, "utf8") * 3) / 4 / 1024; // approximate raw size
        logger.debug("[PDF_OCR_AZURE] Chunk request", {
          pages: `${start}-${end}`,
          chunkSizeKB: chunkSizeKB.toFixed(0),
        });
        const { pages, endpointIndex } = await ocrSingleChunk(base64);
        logger.debug("[PDF_OCR_AZURE] Chunk done", {
          pages: `${start}-${end}`,
          extractedPages: pages.length,
          endpointIndex,
        });
        return { start, end, pages };
      })
    );
    const batchMs = Date.now() - batchT0;

    const batchPages = batchResults.reduce((sum, r) => sum + r.pages.length, 0);
    logger.info("[PDF_OCR_AZURE] Batch complete", {
      batch: `${batchIndex}/${totalBatches}`,
      pagesProcessed: batchPages,
      ms: batchMs,
    });

    chunkResults.push(...batchResults);
  }

  const allPages: OcrPage[] = [];
  let globalIndex = 0;
  for (const { pages } of chunkResults) {
    for (const p of pages) {
      allPages.push(rewriteOcrPageImageIds(p, globalIndex));
      globalIndex++;
    }
  }

  const textContent = allPages
    .map((p) => p.markdown)
    .filter(Boolean)
    .join("\n\n");

  logger.info("[PDF_OCR_AZURE] Complete", {
    pageCount: allPages.length,
    totalMs: Date.now() - t0,
  });

  return { pages: allPages, textContent };
}
