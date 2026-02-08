import { useState, useCallback } from "react";

export interface UploadedImageMetadata {
    fileUrl: string;
    filename: string;
    fileSize: number;
    name: string;
}

export interface ImageUploadState {
    isUploading: boolean;
    error: Error | null;
    uploadedFiles: UploadedImageMetadata[];
}

/**
 * Hook for uploading image files to Supabase storage
 * Mirrors usePdfUpload but for image file types
 */
export function useImageUpload() {
    const [state, setState] = useState<ImageUploadState>({
        isUploading: false,
        error: null,
        uploadedFiles: [],
    });

    const uploadFiles = useCallback(async (files: File[]): Promise<UploadedImageMetadata[]> => {
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
                    throw new Error(`Failed to upload image: ${uploadResponse.statusText}`);
                }

                const { url: fileUrl, filename } = await uploadResponse.json();

                return {
                    fileUrl,
                    filename: filename || file.name,
                    fileSize: file.size,
                    name: file.name.replace(/\.(jpg|jpeg|png|gif|webp|svg|bmp|tiff?)$/i, ""),
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
            const err = error instanceof Error ? error : new Error("Failed to upload images");
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
