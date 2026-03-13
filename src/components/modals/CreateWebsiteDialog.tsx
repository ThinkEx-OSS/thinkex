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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface CreateWebsiteDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onCreate: (url: string, name: string, favicon?: string) => void;
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

/**
 * Get the favicon URL for a given website URL using Google's favicon service
 * Note: We use sz=64 to detect default globe icons (they stay 16x16 while real favicons scale)
 */
function getFaviconUrl(websiteUrl: string): string | undefined {
    try {
        const url = new URL(websiteUrl.trim());
        return `https://www.google.com/s2/favicons?domain=${url.hostname}&sz=64`;
    } catch {
        return undefined;
    }
}

/**
 * Extract a display name from a URL (domain without www)
 */
function getDisplayName(websiteUrl: string): string {
    try {
        const url = new URL(websiteUrl.trim());
        return url.hostname.replace(/^www\./, "");
    } catch {
        return "Website";
    }
}

export function CreateWebsiteDialog({
    open,
    onOpenChange,
    onCreate,
}: CreateWebsiteDialogProps) {
    const [url, setUrl] = useState("");
    const [name, setName] = useState("");
    const [isValid, setIsValid] = useState(false);
    const [isLoadingTitle, setIsLoadingTitle] = useState(false);
    const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

    // Validate URL as user types
    useEffect(() => {
        setIsValid(isValidUrl(url));
    }, [url]);

    // Auto-fill name from domain when a valid URL is entered
    useEffect(() => {
        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
        }

        if (isValid && url.trim() && !name.trim()) {
            debounceTimerRef.current = setTimeout(() => {
                setName(getDisplayName(url));
            }, 300);
        }

        return () => {
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
            }
        };
    }, [url, isValid]);

    const handleSubmit = useCallback(() => {
        if (!isValid || !url.trim()) {
            toast.error("Please enter a valid website URL");
            return;
        }

        const cardName = name.trim() || getDisplayName(url);
        const favicon = getFaviconUrl(url);
        onCreate(url.trim(), cardName, favicon);

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
            setIsLoadingTitle(false);
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
            }
        }
    }, [open]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent onKeyDown={handleKeyDown}>
                <DialogHeader>
                    <DialogTitle>Embed Website</DialogTitle>
                    <DialogDescription>
                        Enter a website URL to embed it in your workspace.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="website-url">Website URL</Label>
                        <Input
                            id="website-url"
                            type="url"
                            placeholder="https://example.com"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            autoFocus
                        />
                        {!isValid && url && (
                            <p className="text-sm text-red-500">
                                Please enter a valid URL (http:// or https://)
                            </p>
                        )}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="website-name">Card Name</Label>
                        <Input
                            id="website-name"
                            type="text"
                            placeholder={isValid ? getDisplayName(url) : "Website"}
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                            Leave empty to use the domain name
                        </p>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={!isValid}
                    >
                        Add Website
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
