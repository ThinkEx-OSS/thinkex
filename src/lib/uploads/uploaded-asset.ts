import type {
  AudioData,
  ImageData,
  PdfData,
} from "@/lib/workspace-state/types";
import type { OcrCandidate } from "@/lib/ocr/types";
import { buildPdfDataFromUpload, getPdfSourceUrl } from "@/lib/pdf/pdf-item";

export type UploadedAssetKind = "file" | "image" | "audio";

export interface UploadedAsset {
  kind: UploadedAssetKind;
  fileUrl: string;
  filename: string;
  displayName: string;
  fileSize?: number;
  contentType: string;
  name: string;
  originalFile?: File;
}

export type WorkspaceItemDefinition =
  | {
      type: "pdf";
      name: string;
      initialData: Partial<PdfData>;
    }
  | {
      type: "image";
      name: string;
      initialData: Partial<ImageData>;
    }
  | {
      type: "audio";
      name: string;
      initialData: Partial<AudioData>;
    };

function getBaseName(filename: string): string {
  return filename.replace(/\.[^/.]+$/, "");
}

function getResolvedContentType(params: {
  contentType: string;
  originalFile?: File;
}): string {
  return params.contentType || params.originalFile?.type || "";
}

function inferAssetKind(params: {
  contentType: string;
  displayName: string;
  originalFile?: File;
}): UploadedAssetKind {
  const resolvedType = getResolvedContentType(params);

  if (resolvedType.startsWith("audio/")) {
    return "audio";
  }

  if (resolvedType.startsWith("image/")) {
    return "image";
  }

  return "file";
}

export function createUploadedAsset(params: {
  fileUrl: string;
  filename: string;
  displayName: string;
  fileSize?: number;
  contentType: string;
  originalFile?: File;
}): UploadedAsset {
  const kind = inferAssetKind(params);
  const name = getBaseName(params.displayName);
  const resolvedType =
    getResolvedContentType(params) || "application/octet-stream";

  return {
    kind,
    fileUrl: params.fileUrl,
    filename: params.filename,
    displayName: params.displayName,
    fileSize: params.fileSize,
    contentType: resolvedType,
    name,
    ...(params.originalFile ? { originalFile: params.originalFile } : {}),
  };
}

export function buildWorkspaceItemDefinitionFromAsset(
  asset: UploadedAsset,
): WorkspaceItemDefinition {
  if (asset.kind === "image") {
    return {
      type: "image",
      name: asset.name,
      initialData: {
        url: asset.fileUrl,
        altText: asset.name,
        ocrStatus: "processing",
        ocrPages: [],
      },
    };
  }

  if (asset.kind === "audio") {
    return {
      type: "audio",
      name: asset.name,
      initialData: {
        fileUrl: asset.fileUrl,
        filename: asset.filename,
        fileSize: asset.fileSize,
        mimeType: asset.originalFile?.type || asset.contentType || "audio/mpeg",
        processingStatus: "processing",
      },
    };
  }

  return {
    type: "pdf",
    name: asset.name,
    initialData: buildPdfDataFromUpload({
      fileUrl: asset.fileUrl,
      filename: asset.filename,
      contentType: asset.contentType,
      fileSize: asset.fileSize,
      displayName: asset.displayName,
    }),
  };
}

export function buildWorkspaceItemDefinitionsFromAssets(
  assets: UploadedAsset[],
): WorkspaceItemDefinition[] {
  return assets.map((asset) => buildWorkspaceItemDefinitionFromAsset(asset));
}

export function buildOcrCandidatesFromAssets(
  assets: UploadedAsset[],
  itemIds: Array<string | undefined>,
): OcrCandidate[] {
  if (assets.length !== itemIds.length) {
    throw new Error(
      `Expected assets and itemIds to align, received ${assets.length} assets and ${itemIds.length} itemIds`,
    );
  }

  const candidates: OcrCandidate[] = [];

  itemIds.forEach((itemId, index) => {
    const asset = assets[index];
    if (!itemId || !asset) return;

    if (asset.kind === "image") {
      candidates.push({
        itemId,
        itemType: "image",
        fileUrl: asset.fileUrl,
      });
      return;
    }

    if (asset.kind !== "file") {
      return;
    }

    const sourceUrl = getPdfSourceUrl(
      buildPdfDataFromUpload({
        fileUrl: asset.fileUrl,
        filename: asset.filename,
        contentType: asset.contentType,
        fileSize: asset.fileSize,
        displayName: asset.displayName,
      }),
    );

    if (sourceUrl) {
      candidates.push({
        itemId,
        itemType: "file",
        fileUrl: sourceUrl,
      });
    }
  });

  return candidates;
}
