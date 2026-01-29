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
import { isValidYouTubeUrl } from "@/lib/utils/youtube-url";
import { toast } from "sonner";

interface CreateYouTubeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (url: string, name: string, thumbnail?: string) => void;
}

export function CreateYouTubeDialog({
  open,
  onOpenChange,
  onCreate,
}: CreateYouTubeDialogProps) {
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [thumbnail, setThumbnail] = useState<string | undefined>(undefined);
  const [isValid, setIsValid] = useState(false);
  const [isLoadingTitle, setIsLoadingTitle] = useState(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Validate URL as user types
  useEffect(() => {
    setIsValid(isValidYouTubeUrl(url));
  }, [url]);

  // Fetch YouTube metadata when a valid URL is entered
  useEffect(() => {
    // Clear any existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Always fetch metadata if URL is valid (we need thumbnail even if name is provided)
    if (isValid && url.trim()) {
      setIsLoadingTitle(true);

      // Debounce the API call to avoid making requests on every keystroke
      debounceTimerRef.current = setTimeout(async () => {
        try {
          const response = await fetch(
            `/api/youtube/metadata?url=${encodeURIComponent(url.trim())}`
          );

          if (response.ok) {
            const data = await response.json();
            // Only auto-fill name if it's still empty (user might have typed while loading)
            if (data.title && !name.trim()) {
              setName(data.title);
            }
            // Always store thumbnail (needed for playlists)
            if (data.thumbnail) {
              setThumbnail(data.thumbnail);
            }
          }
          // Silently fail if metadata fetch fails - user can still enter name manually
        } catch (error) {
          // Silently fail - user can still enter name manually
          console.error("Failed to fetch YouTube metadata:", error);
        } finally {
          setIsLoadingTitle(false);
        }
      }, 500); // 500ms debounce
    } else {
      setIsLoadingTitle(false);
    }

    // Cleanup function
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [url, isValid]);

  const handleSubmit = useCallback(() => {
    if (!isValid || !url.trim()) {
      toast.error("Please enter a valid YouTube URL");
      return;
    }

    const cardName = name.trim() || "YouTube Video";
    onCreate(url.trim(), cardName, thumbnail);

    // Reset form
    setUrl("");
    setName("");
    setThumbnail(undefined);
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
      setThumbnail(undefined);
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
          <DialogTitle>Add YouTube Video</DialogTitle>
          <DialogDescription>
            Enter a YouTube URL to embed a video in your workspace.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="youtube-url">YouTube URL</Label>
            <Input
              id="youtube-url"
              type="url"
              placeholder="https://www.youtube.com/watch?v=..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              autoFocus
            />
            {!isValid && url && (
              <p className="text-sm text-red-500">
                Please enter a valid YouTube URL
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="youtube-name">Card Name {isLoadingTitle && "(Loading...)"}</Label>
            <Input
              id="youtube-name"
              type="text"
              placeholder={isLoadingTitle ? "Loading video title..." : "YouTube Video"}
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isLoadingTitle}
            />
            <p className="text-xs text-muted-foreground">
              {isLoadingTitle
                ? "Fetching video title..."
                : "The video title will be automatically filled in, or leave empty to use \"YouTube Video\""}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!isValid || isLoadingTitle}
          >
            Add Video
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
