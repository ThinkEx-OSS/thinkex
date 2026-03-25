import { uploadFileDirect } from "@/lib/uploads/client-upload";
import { filterPasswordProtectedPdfs } from "@/lib/uploads/pdf-validation";
import {
  createUploadedAsset,
  type UploadedAsset,
} from "@/lib/uploads/uploaded-asset";

export const DEFAULT_WORKSPACE_MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

export interface PreparedWorkspaceUploadSelection {
  acceptedFiles: File[];
  oversizedFiles: File[];
  protectedPdfNames: string[];
}

export function isPdfFile(file: File): boolean {
  return (
    file.type === "application/pdf" ||
    file.name.toLowerCase().endsWith(".pdf")
  );
}

export function getFileSizeLabel(file: File): string {
  return `${file.name} (${(file.size / (1024 * 1024)).toFixed(1)}MB)`;
}

export async function prepareWorkspaceUploadSelection(
  files: File[],
  options?: { maxFileSizeBytes?: number }
): Promise<PreparedWorkspaceUploadSelection> {
  const maxFileSizeBytes =
    options?.maxFileSizeBytes ?? DEFAULT_WORKSPACE_MAX_FILE_SIZE_BYTES;

  const acceptedBySize: File[] = [];
  const oversizedFiles: File[] = [];

  files.forEach((file) => {
    if (file.size > maxFileSizeBytes) {
      oversizedFiles.push(file);
      return;
    }
    acceptedBySize.push(file);
  });

  const pdfFiles = acceptedBySize.filter(isPdfFile);
  const { valid: unprotectedPdfs, rejected: protectedPdfNames } =
    await filterPasswordProtectedPdfs(pdfFiles);

  const allowedPdfFiles = new Set(unprotectedPdfs);
  const acceptedFiles = acceptedBySize.filter(
    (file) => !isPdfFile(file) || allowedPdfFiles.has(file)
  );

  return {
    acceptedFiles,
    oversizedFiles,
    protectedPdfNames,
  };
}

export async function uploadSelectedFile(file: File): Promise<UploadedAsset> {
  const uploadResult = await uploadFileDirect(file);
  return createUploadedAsset({
    fileUrl: uploadResult.url,
    filename: uploadResult.filename || file.name,
    displayName: uploadResult.displayName || file.name,
    fileSize: file.size,
    contentType: uploadResult.contentType || file.type || "application/octet-stream",
    originalFile: file,
  });
}

export async function uploadSelectedFiles(files: File[]): Promise<{
  uploads: UploadedAsset[];
  failedFiles: string[];
}> {
  const results = await Promise.all(
    files.map(async (file) => {
      try {
        return await uploadSelectedFile(file);
      } catch {
        return null;
      }
    })
  );

  const uploads: UploadedAsset[] = [];
  const failedFiles: string[] = [];

  results.forEach((result, index) => {
    if (result) {
      uploads.push(result);
    } else {
      failedFiles.push(files[index]?.name || "Unknown file");
    }
  });

  return { uploads, failedFiles };
}
