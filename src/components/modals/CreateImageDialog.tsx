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
import { ImageIcon, Loader2, UploadCloud } from "lucide-react";
import { useDropzone } from "react-dropzone";
import { cn } from "@/lib/utils";

interface CreateImageDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onCreate: (url: string, name: string) => void;
}

export function CreateImageDialog({
    open,
    onOpenChange,
    onCreate,
}: CreateImageDialogProps) {
    const [url, setUrl] = useState("");
    const [name, setName] = useState("");
    const [isValid, setIsValid] = useState(false);
    const [isUploading, setIsUploading] = useState(false);

    // Basic validation that it looks like a URL
    useEffect(() => {
        try {
            if (!url.trim()) {
                setIsValid(false);
                return;
            }
            new URL(url);
            setIsValid(true);
        } catch {
            setIsValid(false);
        }
    }, [url]);

    const handleSubmit = useCallback(() => {
        if (!isValid || !url.trim()) {
            toast.error("Please enter a valid Image URL");
            return;
        }

        const cardName = name.trim() || "Image";
        onCreate(url.trim(), cardName);

        // Reset form
        setUrl("");
        setName("");
        onOpenChange(false);
    }, [url, name, isValid, onCreate, onOpenChange]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && isValid) {
            e.preventDefault();
            handleSubmit();
        } else if (e.key === 'Escape') {
            onOpenChange(false);
        }
    }, [isValid, handleSubmit, onOpenChange]);

    // Reset form when dialog opens
    useEffect(() => {
        if (open) {
            setUrl("");
            setName("");
            setIsValid(false);
        }
    }, [open]);

    // Shared upload function
    const uploadFile = useCallback(async (file: File) => {
        setIsUploading(true);
        const toastId = toast.loading("Uploading image...");

        try {
            const formData = new FormData();
            formData.append('file', file);

            const response = await fetch('/api/upload-file', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                throw new Error('Failed to upload image');
            }

            const data = await response.json();

            setUrl(data.url);
            if (!name) {
                // Use filename without extension as default name
                const simpleName = file.name.split('.').slice(0, -1).join('.') || "Image";
                setName(simpleName);
            }

            toast.success("Image uploaded successfully");
        } catch (error) {
            console.error("Upload failed:", error);
            toast.error("Failed to upload image");
        } finally {
            setIsUploading(false);
            toast.dismiss(toastId);
        }
    }, [name]);

    // Handle paste event to capture image data
    const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
        const items = e.clipboardData.items;
        let imageFile: File | null = null;

        // Find image file in clipboard items
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf("image") !== -1) {
                imageFile = items[i].getAsFile();
                break;
            }
        }

        if (!imageFile) return;

        // If we found an image, upload it
        e.preventDefault();
        await uploadFile(imageFile);
    }, [uploadFile]);

    const onDrop = useCallback((acceptedFiles: File[]) => {
        if (acceptedFiles.length > 0) {
            uploadFile(acceptedFiles[0]);
        }
    }, [uploadFile]);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: {
            'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp']
        },
        maxFiles: 1,
        disabled: isUploading
    });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent onKeyDown={handleKeyDown}>
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <ImageIcon className="size-5" />
                        Add Image
                    </DialogTitle>
                    <DialogDescription>
                        Drag and drop, paste from clipboard, or enter a URL.
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
                            {isUploading ? "Uploading..." : isDragActive ? "Drop image here" : "Click or drag image here"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                            Supports PNG, JPG, GIF, WebP
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
                        <Label htmlFor="image-url">Image URL</Label>
                        <Input
                            id="image-url"
                            type="url"
                            placeholder="https://example.com/image.jpg"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            onPaste={handlePaste}
                            disabled={isUploading}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="image-name">Card Name</Label>
                        <Input
                            id="image-name"
                            type="text"
                            placeholder="Image Title (Optional)"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={!isValid || isUploading}
                    >
                        {isUploading ? "Uploading..." : "Add Image"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
