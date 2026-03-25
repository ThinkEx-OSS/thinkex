"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useRef,
  useEffect,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { filterPasswordProtectedPdfs } from "@/lib/uploads/pdf-validation";
import { emitPasswordProtectedPdf } from "@/components/modals/PasswordProtectedPdfDialog";
import {
  isPdfFile,
  uploadSelectedFile,
} from "@/lib/uploads/upload-selection";

const MAX_TOTAL_FILE_BYTES = 50 * 1024 * 1024; // 50 MB
const MAX_LINKS = 5;

function isYouTubeUrl(url: string): boolean {
  return /youtube\.com\/watch|youtu\.be\//.test(url);
}

export type FileUploadResult = {
  url: string;
  mediaType: string;
  filename?: string;
  storagePath?: string;
  fileSize?: number;
};

export type FileItem = {
  id: string;
  file: File;
  status: "uploading" | "ready" | "error";
  result?: FileUploadResult;
  error?: string;
};

interface HomeAttachmentsContextValue {
  fileItems: FileItem[];
  files: File[];
  links: string[];
  addFiles: (newFiles: File[]) => Promise<void>;
  removeFile: (index: number) => void;
  addLink: (url: string) => void;
  removeLink: (index: number) => void;
  clearAll: () => void;
  totalFileSize: number;
  hasYouTubeLink: boolean;
  canAddMoreLinks: boolean;
  canAddYouTube: boolean;
  hasUploading: boolean;
  /** Waits for all in-flight uploads to complete. Resolves when done. */
  awaitAllUploads: () => Promise<void>;
  /** Returns the latest file items (use after awaitAllUploads to check post-upload state). */
  getFileItems: () => FileItem[];
}

const HomeAttachmentsContext = createContext<HomeAttachmentsContextValue | null>(
  null
);

export function HomeAttachmentsProvider({ children }: { children: ReactNode }) {
  const [fileItems, setFileItems] = useState<FileItem[]>([]);
  const [links, setLinks] = useState<string[]>([]);
  const uploadPromisesRef = useRef<Map<string, Promise<void>>>(new Map());
  const fileItemsRef = useRef<FileItem[]>([]);

  const files = useMemo(() => fileItems.map((i) => i.file), [fileItems]);
  const totalFileSize = useMemo(
    () => fileItems.reduce((sum, i) => sum + i.file.size, 0),
    [fileItems]
  );

  const hasYouTubeLink = useMemo(
    () => links.some(isYouTubeUrl),
    [links]
  );

  const canAddMoreLinks = links.length < MAX_LINKS;
  const canAddYouTube = !hasYouTubeLink;
  const hasUploading = fileItems.some((i) => i.status === "uploading");

  useEffect(() => {
    fileItemsRef.current = fileItems;
  }, [fileItems]);

  const addFiles = useCallback(async (newFiles: File[]) => {
    if (newFiles.length === 0) return;

    const pdfFiles = newFiles.filter(isPdfFile);

    const { valid: validPdfs, rejected: protectedNames } =
      await filterPasswordProtectedPdfs(pdfFiles);
    if (protectedNames.length > 0) {
      emitPasswordProtectedPdf(protectedNames);
    }
    const validPdfSet = new Set(validPdfs);
    const toAdd = newFiles.filter(
      (file) => !isPdfFile(file) || validPdfSet.has(file)
    );
    if (toAdd.length === 0) return;

    const newItems: FileItem[] = toAdd.map((file) => ({
      id: crypto.randomUUID(),
      file,
      status: "uploading",
    }));

    let didAdd = false;
    setFileItems((prev) => {
      const currentSize = prev.reduce((sum, i) => sum + i.file.size, 0);
      const newSize = newItems.reduce((sum, i) => sum + i.file.size, 0);
      if (currentSize + newSize > MAX_TOTAL_FILE_BYTES) {
        toast.error(
          `Total file size exceeds ${MAX_TOTAL_FILE_BYTES / (1024 * 1024)}MB limit`
        );
        return prev;
      }
      didAdd = true;
      const next = [...prev, ...newItems];
      fileItemsRef.current = next;
      return next;
    });
    if (!didAdd) return;

    toast.success(`Added ${newItems.length} file${newItems.length > 1 ? "s" : ""}`);

    const uploadPromises = newItems.map((item) => {
      const promise = uploadSelectedFile(item.file)
        .then((uploadResult) => {
          setFileItems((prev) => {
            const existing = prev.find((i) => i.id === item.id);
            if (!existing) return prev;
            const next = prev.map((i) =>
              i.id === item.id
                ? {
                    ...i,
                    status: "ready" as const,
                    result: {
                      url: uploadResult.fileUrl,
                      mediaType: uploadResult.contentType,
                      filename: uploadResult.displayName,
                      storagePath: uploadResult.filename,
                      fileSize: i.file.size,
                    },
                  }
                : i
            );
            fileItemsRef.current = next;
            return next;
          });
        })
        .catch((err) => {
          setFileItems((prev) => {
            const existing = prev.find((i) => i.id === item.id);
            if (!existing) return prev;
            const next = prev.map((i) =>
              i.id === item.id
                ? {
                    ...i,
                    status: "error" as const,
                    error: err instanceof Error ? err.message : "Upload failed",
                  }
                : i
            );
            fileItemsRef.current = next;
            return next;
          });
          throw err;
        })
        .finally(() => {
          uploadPromisesRef.current.delete(item.id);
        });

      uploadPromisesRef.current.set(item.id, promise);
      return promise;
    });

    void Promise.allSettled(uploadPromises).then((results) => {
      const failedCount = results.filter(
        (result) => result.status === "rejected"
      ).length;

      if (failedCount === 0) return;

      const successCount = results.length - failedCount;
      if (successCount === 0) {
        toast.error(
          `Couldn't upload ${failedCount} file${failedCount > 1 ? "s" : ""}`
        );
        return;
      }

      toast.error(
        `Uploaded ${successCount} file${successCount > 1 ? "s" : ""}. ${failedCount} failed.`
      );
    });
  }, []);

  const removeFile = useCallback((index: number) => {
    setFileItems((prev) => {
      const item = prev[index];
      if (item) uploadPromisesRef.current.delete(item.id);
      const next = prev.filter((_, i) => i !== index);
      fileItemsRef.current = next;
      return next;
    });
  }, []);

  const addLink = useCallback((url: string) => {
    const trimmed = url.trim();
    if (!trimmed) return;

    try {
      new URL(trimmed);
    } catch {
      toast.error("Please enter a valid URL");
      return;
    }

    if (links.length >= MAX_LINKS) {
      toast.error(`Maximum ${MAX_LINKS} links allowed`);
      return;
    }

    if (isYouTubeUrl(trimmed) && hasYouTubeLink) {
      toast.error("Only one YouTube video allowed");
      return;
    }

    if (links.includes(trimmed)) {
      toast.error("This link is already added");
      return;
    }

    setLinks((prev) => [...prev, trimmed]);
    toast.success("Link added");
  }, [links, hasYouTubeLink]);

  const removeLink = useCallback((index: number) => {
    setLinks((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const clearAll = useCallback(() => {
    uploadPromisesRef.current.clear();
    fileItemsRef.current = [];
    setFileItems([]);
    setLinks([]);
  }, []);

  const awaitAllUploads = useCallback(() => {
    const promises = Array.from(uploadPromisesRef.current.values());
    return Promise.all(promises).then(() => {});
  }, []);

  const getFileItems = useCallback(() => fileItemsRef.current, []);

  const value = useMemo<HomeAttachmentsContextValue>(
    () => ({
      fileItems,
      files,
      links,
      addFiles,
      removeFile,
      addLink,
      removeLink,
      clearAll,
      totalFileSize,
      hasYouTubeLink,
      canAddMoreLinks,
      canAddYouTube,
      hasUploading,
      awaitAllUploads,
      getFileItems,
    }),
    [
      fileItems,
      files,
      links,
      addFiles,
      removeFile,
      addLink,
      removeLink,
      clearAll,
      totalFileSize,
      hasYouTubeLink,
      canAddMoreLinks,
      canAddYouTube,
      hasUploading,
      awaitAllUploads,
      getFileItems,
    ]
  );

  return (
    <HomeAttachmentsContext.Provider value={value}>
      {children}
    </HomeAttachmentsContext.Provider>
  );
}

export function useHomeAttachments() {
  const ctx = useContext(HomeAttachmentsContext);
  if (!ctx) {
    throw new Error(
      "useHomeAttachments must be used within HomeAttachmentsProvider"
    );
  }
  return ctx;
}

export const ATTACHMENTS_SESSION_KEY = "thinkex-autogen-attachments";
export { MAX_TOTAL_FILE_BYTES, MAX_LINKS, isYouTubeUrl };
