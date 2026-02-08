"use client";

import { useState, useCallback, useEffect } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, UploadCloud } from "lucide-react";
import { useDropzone } from "react-dropzone";
import { cn } from "@/lib/utils";

interface UploadDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onImageCreate: (url: string, name: string) => void;
    onPDFUpload: (files: File[]) => Promise<void>;
}

export function UploadDialog({
    open,
    onOpenChange,
    onImageCreate,
    onPDFUpload,
}: UploadDialogProps) {
    const [url, setUrl] = useState("");
    const [cardName, setCardName] = useState("");
    const [isUrlValid, setIsUrlValid] = useState(false);
    const [isUploading, setIsUploading] = useState(false);

    // Detect if a URL points to a PDF
    const isPdfUrl = useCallback((urlStr: string) => {
        try {
            const parsed = new URL(urlStr);
            return parsed.pathname.toLowerCase().endsWith('.pdf');
        } catch {
            return false;
        }
    }, []);

    // Basic URL validation
    useEffect(() => {
        try {
            if (!url.trim()) {
                setIsUrlValid(false);
                return;
            }
            new URL(url);
            setIsUrlValid(true);
        } catch {
            setIsUrlValid(false);
        }
    }, [url]);

    // Reset form when dialog opens
    useEffect(() => {
        if (open) {
            setUrl("");
            setCardName("");
            setIsUrlValid(false);
        }
    }, [open]);

    // Upload multiple image files
    const uploadImageFiles = useCallback(async (files: File[]) => {
        setIsUploading(true);
        const toastId = toast.loading(`Uploading ${files.length} image${files.length > 1 ? 's' : ''}...`);

        try {
            for (const file of files) {
                const formData = new FormData();
                formData.append('file', file);

                const response = await fetch('/api/upload-file', {
                    method: 'POST',
                    body: formData,
                });

                if (!response.ok) {
                    throw new Error(`Failed to upload image: ${file.name}`);
                }

                const data = await response.json();
                const simpleName = file.name.split('.').slice(0, -1).join('.') || "Image";
                onImageCreate(data.url, simpleName);
            }

            toast.dismiss(toastId);
            toast.success(`${files.length} image${files.length > 1 ? 's' : ''} uploaded successfully`);
            onOpenChange(false);
        } catch (error) {
            console.error("Upload failed:", error);
            toast.error("Failed to upload image(s)");
            toast.dismiss(toastId);
        } finally {
            setIsUploading(false);
        }
    }, [onImageCreate, onOpenChange]);

    // Handle PDF files
    const handlePDFFiles = useCallback(async (files: File[]) => {
        const pdfFiles = files.filter(file =>
            file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
        );

        if (pdfFiles.length === 0) {
            toast.error('No valid PDF files found');
            return;
        }

        // Check individual file size limit (50MB per file)
        const maxIndividualSize = 50 * 1024 * 1024;
        const oversizedFiles = pdfFiles.filter(file => file.size > maxIndividualSize);
        if (oversizedFiles.length > 0) {
            toast.error(`${oversizedFiles.length} file(s) exceed the 50MB individual limit`);
            return;
        }

        // Check combined size limit (100MB total)
        const totalSize = pdfFiles.reduce((sum, file) => sum + file.size, 0);
        const maxCombinedSize = 100 * 1024 * 1024;
        if (totalSize > maxCombinedSize) {
            const totalSizeMB = (totalSize / (1024 * 1024)).toFixed(1);
            toast.error(`Total file size (${totalSizeMB}MB) exceeds the 100MB combined limit`);
            return;
        }

        setIsUploading(true);
        try {
            await onPDFUpload(pdfFiles);
            toast.success(`${pdfFiles.length} PDF${pdfFiles.length > 1 ? 's' : ''} uploaded successfully`);
            onOpenChange(false);
        } catch (error) {
            console.error('Error uploading PDFs:', error);
            toast.error('Failed to upload PDF files');
        } finally {
            setIsUploading(false);
        }
    }, [onPDFUpload, onOpenChange]);

    // Handle URL submit — works for both PDF and image URLs
    const handleUrlSubmit = useCallback(async () => {
        if (!isUrlValid || !url.trim()) {
            toast.error("Please enter a valid URL");
            return;
        }

        const trimmedUrl = url.trim();
        const name = cardName.trim();

        if (isPdfUrl(trimmedUrl)) {
            // PDF URL — download and create via onPDFUpload
            setIsUploading(true);
            const toastId = toast.loading("Downloading PDF...");
            try {
                const response = await fetch(trimmedUrl);
                if (!response.ok) throw new Error("Failed to download PDF");
                const blob = await response.blob();
                const filename = name || trimmedUrl.split('/').pop()?.replace(/\.pdf$/i, '') || "PDF";
                const file = new File([blob], `${filename}.pdf`, { type: 'application/pdf' });
                toast.dismiss(toastId);
                await onPDFUpload([file]);
                onOpenChange(false);
            } catch (error) {
                console.error("PDF download failed:", error);
                toast.dismiss(toastId);
                toast.error("Failed to download PDF from URL");
            } finally {
                setIsUploading(false);
            }
        } else {
            // Assume image URL
            onImageCreate(trimmedUrl, name || "Image");
            onOpenChange(false);
        }
    }, [url, cardName, isUrlValid, isPdfUrl, onImageCreate, onPDFUpload, onOpenChange]);

    // Handle paste event to capture image data
    const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
        const items = e.clipboardData.items;
        let imageFile: File | null = null;

        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf("image") !== -1) {
                imageFile = items[i].getAsFile();
                break;
            }
        }

        if (!imageFile) return;

        e.preventDefault();
        await uploadImageFiles([imageFile]);
    }, [uploadImageFiles]);

    // Dropzone that accepts both PDFs and images — supports multi-upload
    const onDrop = useCallback((acceptedFiles: File[]) => {
        if (acceptedFiles.length === 0) return;

        const imageFiles = acceptedFiles.filter(f => f.type.startsWith('image/'));
        const pdfFiles = acceptedFiles.filter(f =>
            f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
        );

        if (imageFiles.length > 0) {
            uploadImageFiles(imageFiles);
        }
        if (pdfFiles.length > 0) {
            handlePDFFiles(pdfFiles);
        }
    }, [uploadImageFiles, handlePDFFiles]);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: {
            'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp'],
            'application/pdf': ['.pdf'],
        },
        disabled: isUploading,
    });

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && isUrlValid) {
            e.preventDefault();
            handleUrlSubmit();
        } else if (e.key === 'Escape') {
            onOpenChange(false);
        }
    }, [isUrlValid, handleUrlSubmit, onOpenChange]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent onKeyDown={handleKeyDown}>
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <UploadCloud className="size-5" />
                        Upload
                    </DialogTitle>
                    <DialogDescription>
                        Drag and drop PDFs or images, paste from clipboard, or enter a URL.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    {/* Dropzone */}
                    <div
                        {...getRootProps()}
                        className={cn(
                            "border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                            isDragActive ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50",
                            isUploading && "opacity-50 pointer-events-none"
                        )}
                    >
                        <input {...getInputProps()} />
                        <div className="bg-muted p-3 rounded-full mb-3">
                            {isUploading ? <Loader2 className="size-6 animate-spin text-muted-foreground" /> : <UploadCloud className="size-6 text-muted-foreground" />}
                        </div>
                        <p className="text-sm font-medium mb-1">
                            {isUploading ? "Uploading..." : isDragActive ? "Drop files here" : "Click or drag files here"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                            Supports PDF, PNG, JPG, GIF, WebP
                        </p>
                    </div>

                    <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                            <span className="w-full border-t" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                            <span className="bg-background px-2 text-muted-foreground">
                                Or via URL
                            </span>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="upload-url">URL</Label>
                        <Input
                            id="upload-url"
                            type="url"
                            placeholder="https://example.com/file.pdf or image.jpg"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            onPaste={handlePaste}
                            disabled={isUploading}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="upload-card-name">Card Name</Label>
                        <Input
                            id="upload-card-name"
                            type="text"
                            placeholder="Card Title (Optional)"
                            value={cardName}
                            onChange={(e) => setCardName(e.target.value)}
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleUrlSubmit}
                        disabled={!isUrlValid || isUploading}
                    >
                        {isUploading ? "Uploading..." : "Add from URL"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
