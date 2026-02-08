"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface CreateWebsiteDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    workspaceId: string;
    folderId?: string;
    onNoteCreated?: (noteId: string) => void;
}

/**
 * Validates if a string is a valid HTTP/HTTPS URL
 */
function isValidUrl(str: string): boolean {
    try {
        const url = new URL(str.trim());
        return url.protocol === "http:" || url.protocol === "https:";
    } catch {
        return false;
    }
}

export function CreateWebsiteDialog({
    open,
    onOpenChange,
    workspaceId,
    folderId,
    onNoteCreated,
}: CreateWebsiteDialogProps) {
    const [urlsText, setUrlsText] = useState("");
    const [isCreating, setIsCreating] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Parse and validate URLs from textarea
    const parseUrls = useCallback(() => {
        const lines = urlsText.split("\n").map((line) => line.trim()).filter(Boolean);
        const validUrls: string[] = [];
        const invalidLines: string[] = [];

        for (const line of lines) {
            if (isValidUrl(line)) {
                validUrls.push(line);
            } else {
                invalidLines.push(line);
            }
        }

        return { validUrls, invalidLines };
    }, [urlsText]);

    const { validUrls, invalidLines } = parseUrls();
    const hasValidUrls = validUrls.length > 0;

    const handleSubmit = useCallback(async () => {
        if (!hasValidUrls || isCreating) return;

        if (invalidLines.length > 0) {
            toast.warning(`Skipping ${invalidLines.length} invalid URL(s)`);
        }

        // Close dialog immediately for non-blocking UX
        onOpenChange(false);
        setUrlsText("");

        // Show loading toast
        const toastId = toast.loading("Creating note from websites...", {
            description: `Processing ${validUrls.length} URL${validUrls.length > 1 ? 's' : ''}`,
        });

        setIsCreating(true);

        try {
            const response = await fetch("/api/notes/create-from-urls", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    urls: validUrls,
                    workspaceId,
                    folderId,
                }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `Request failed with status ${response.status}`);
            }

            const result = await response.json();

            if (result.success && result.itemId) {
                if (result.warning) {
                    toast.warning("Note created with issues", {
                        id: toastId,
                        description: result.warning,
                        duration: 6000,
                    });
                } else {
                    toast.success("Website note created!", {
                        id: toastId,
                        description: "Your note is ready",
                    });
                }
                onNoteCreated?.(result.itemId);
            } else {
                throw new Error(result.message || "Failed to create note");
            }
        } catch (error) {
            console.error("Error creating website note:", error);
            toast.error("Failed to create note from websites", {
                id: toastId,
                description: error instanceof Error ? error.message : undefined,
            });
        } finally {
            setIsCreating(false);
        }
    }, [validUrls, hasValidUrls, isCreating, invalidLines.length, workspaceId, folderId, onNoteCreated, onOpenChange]);

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            // Cmd/Ctrl + Enter to submit
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && hasValidUrls && !isCreating) {
                e.preventDefault();
                handleSubmit();
            } else if (e.key === "Escape") {
                onOpenChange(false);
            }
        },
        [hasValidUrls, isCreating, handleSubmit, onOpenChange]
    );

    // Reset form when dialog opens
    useEffect(() => {
        if (open) {
            setUrlsText("");
            setIsCreating(false);
            // Focus textarea after dialog opens
            setTimeout(() => textareaRef.current?.focus(), 100);
        }
    }, [open]);

    const handlePaste = useCallback((e: React.ClipboardEvent) => {
        // Prevent default paste to handle it manually
        e.preventDefault();

        // Get pasted text
        let text = e.clipboardData.getData("text");

        // 1. Pre-process to separate mashed URLs (e.g. "http://a.comhttp://b.com")
        // This adds a space before any http protocol that isn't at the very start
        text = text.replace(/(?<!^)(https?:\/\/)/g, " $1");

        // 2. Split by whitespace or commas
        // Filter out empty strings
        const urls = text.split(/[\s,]+/).filter(Boolean);

        if (urls.length === 0) return;

        // 3. Prepare content to insert
        let formattedText = urls.join("\n");

        // 4. Handle insertion context
        const textarea = e.currentTarget as HTMLTextAreaElement;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;

        const currentValue = urlsText;

        // If we are appending to a line that has content, prepend a newline
        // We look at the character before the cursor
        if (start > 0 && currentValue[start - 1] !== "\n") {
            formattedText = "\n" + formattedText;
        }

        const newValue =
            currentValue.substring(0, start) +
            formattedText +
            currentValue.substring(end);

        setUrlsText(newValue);

        // Update cursor position (async to let render happen, though React state update might contest this)
        // With standard React controlled inputs, we usually just set state. 
        // We can create a synthetic change event or just let the effect handle it, 
        // but explicit state setting is cleanest here.

        // Fix cursor position after update
        setTimeout(() => {
            if (textareaRef.current) {
                const newCursorPos = start + formattedText.length;
                textareaRef.current.selectionStart = textareaRef.current.selectionEnd = newCursorPos;
            }
        }, 0);
    }, [urlsText]);

    return (
        <Dialog open={open} onOpenChange={isCreating ? undefined : onOpenChange}>
            <DialogContent onKeyDown={handleKeyDown} className="sm:max-w-md max-h-[85vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Create Note from Websites</DialogTitle>
                    <DialogDescription>
                        Paste one or more website URLs (one per line). A note will be created with content synthesized from these pages.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4 overflow-y-auto flex-1 min-h-0">
                    <div className="space-y-2">
                        <Label htmlFor="website-urls">Website URLs</Label>
                        <Textarea
                            ref={textareaRef}
                            id="website-urls"
                            placeholder="https://example.com/page-1&#10;https://example.com/page-2"
                            value={urlsText}
                            onChange={(e) => setUrlsText(e.target.value)}
                            onPaste={handlePaste}
                            rows={5}
                            disabled={isCreating}
                            className="resize-none max-h-[40vh] overflow-y-auto"
                        />
                        {urlsText && (
                            <p className="text-xs text-muted-foreground">
                                {validUrls.length} valid URL{validUrls.length !== 1 ? "s" : ""}
                                {invalidLines.length > 0 && (
                                    <span className="text-yellow-500"> • {invalidLines.length} invalid</span>
                                )}
                            </p>
                        )}
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isCreating}>
                        Cancel
                    </Button>
                    <Button onClick={handleSubmit} disabled={!hasValidUrls || isCreating}>
                        {isCreating ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Creating...
                            </>
                        ) : (
                            "Create Note"
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
