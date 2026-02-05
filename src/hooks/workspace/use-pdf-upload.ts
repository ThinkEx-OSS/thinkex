import { useState, useCallback } from "react";
import type { PdfData } from "@/lib/workspace-state/types";

export interface UploadedPdfMetadata {
    fileUrl: string;
    filename: string;
    fileSize: number;
    name: string;
}

export interface PdfUploadState {
    isUploading: boolean;
    error: Error | null;
    uploadedFiles: UploadedPdfMetadata[];
}

/**
 * Hook for uploading PDF files to Supabase storage
 * Consolidates upload logic used across thread.tsx and WorkspaceSection.tsx
 */
export function usePdfUpload() {
    const [state, setState] = useState<PdfUploadState>({
        isUploading: false,
        error: null,
        uploadedFiles: [],
    });

    const uploadFiles = useCallback(async (files: File[]): Promise<UploadedPdfMetadata[]> => {
        setState((prev) => ({ ...prev, isUploading: true, error: null }));

        try {
            const uploadPromises = files.map(async (file) => {
                const formData = new FormData();
                formData.append("file", file);

                const uploadResponse = await fetch("/api/upload-file", {
                    method: "POST",
                    body: formData,
                });

                if (!uploadResponse.ok) {
                    throw new Error(`Failed to upload PDF: ${uploadResponse.statusText}`);
                }

                const { url: fileUrl, filename } = await uploadResponse.json();

                return {
                    fileUrl,
                    filename: filename || file.name,
                    fileSize: file.size,
                    name: file.name.replace(/\.pdf$/i, ""),
                };
            });

            const uploadResults = await Promise.all(uploadPromises);

            setState((prev) => ({
                ...prev,
                isUploading: false,
                uploadedFiles: [...prev.uploadedFiles, ...uploadResults],
            }));

            return uploadResults;
        } catch (error) {
            const err = error instanceof Error ? error : new Error("Failed to upload PDFs");
            setState((prev) => ({ ...prev, isUploading: false, error: err }));
            throw err;
        }
    }, []);

    const clearFiles = useCallback(() => {
        setState({ isUploading: false, error: null, uploadedFiles: [] });
    }, []);

    const removeFile = useCallback((fileUrl: string) => {
        setState((prev) => ({
            ...prev,
            uploadedFiles: prev.uploadedFiles.filter((f) => f.fileUrl !== fileUrl),
        }));
    }, []);

    return {
        ...state,
        uploadFiles,
        clearFiles,
        removeFile,
    };
}
