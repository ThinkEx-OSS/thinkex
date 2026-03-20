import { useState, useCallback } from "react";
import type { PdfData } from "@/lib/workspace-state/types";
import { uploadFileDirect } from "@/lib/uploads/client-upload";
import { isOfficeDocument } from "@/lib/uploads/office-document-validation";
import { filterPasswordProtectedPdfs } from "@/lib/uploads/pdf-validation";
import { emitPasswordProtectedPdf } from "@/components/modals/PasswordProtectedPdfDialog";

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
            const pdfFiles = files.filter(
                (file) => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
            );
            const officeFiles = files.filter(
                (file) => isOfficeDocument(file)
            );

            // Reject password-protected PDFs
            const { valid: unprotectedFiles, rejected: protectedNames } = await filterPasswordProtectedPdfs(pdfFiles);
            if (protectedNames.length > 0) {
                emitPasswordProtectedPdf(protectedNames);
            }
            const filesToUpload = [...unprotectedFiles, ...officeFiles];
            if (filesToUpload.length === 0) {
                setState((prev) => ({ ...prev, isUploading: false }));
                return [];
            }

            const uploadPromises = filesToUpload.map(async (file) => {
                const { url: fileUrl, filename, displayName } = await uploadFileDirect(file);

                return {
                    fileUrl,
                    filename: filename || file.name,
                    fileSize: file.size,
                    name: displayName.replace(/\.pdf$/i, ""),
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
