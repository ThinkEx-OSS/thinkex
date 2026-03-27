export type OcrItemType = "file" | "image";

export interface OcrPage {
  index: number;
  markdown: string;
  footer?: string | null;
  header?: string | null;
  hyperlinks?: unknown[];
  tables?: unknown[];
}

export interface OcrCandidate {
  itemId: string;
  itemType: OcrItemType;
  fileUrl: string;
}

export type OcrMode = "direct" | "batch";

export interface OcrItemSuccessResult {
  itemId: string;
  itemType: OcrItemType;
  ok: true;
  pages: OcrPage[];
}

export interface OcrItemFailureResult {
  itemId: string;
  itemType: OcrItemType;
  ok: false;
  error: string;
}

export type OcrItemResult = OcrItemSuccessResult | OcrItemFailureResult;

export interface OcrRunResult {
  mode: OcrMode;
  results: OcrItemResult[];
}
