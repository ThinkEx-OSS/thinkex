"use client";

import { useState, useEffect } from "react";
import { Copy, Check, Mail } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { WorkspaceWithState } from "@/lib/workspace-state/types";

interface ShareWorkspaceDialogProps {
  workspace: WorkspaceWithState | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ShareWorkspaceDialog({
  workspace,
  open,
  onOpenChange,
}: ShareWorkspaceDialogProps) {
  const [copied, setCopied] = useState(false);
  const [shareUrl, setShareUrl] = useState("");

  useEffect(() => {
    if (workspace && open) {
      const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
      const url = `${baseUrl}/share/${workspace.id}`;
      setShareUrl(url);
    }
  }, [workspace, open]);

  const handleCopy = async () => {
    if (shareUrl) {
      try {
        await navigator.clipboard.writeText(shareUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        console.error("Failed to copy:", err);
      }
    }
  };

  const handleEmailShare = () => {
    const shareTitle = workspace?.name || "Workspace";
    const shareText = `Check out this workspace: ${shareTitle}`;
    const emailBody = `Check out this workspace on ThinkEx: ${shareUrl}`;
    const emailUrl = `mailto:?subject=${encodeURIComponent(shareText)}&body=${encodeURIComponent(emailBody)}`;
    window.location.href = emailUrl;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className="sm:max-w-md border-white/20 bg-black/40 backdrop-blur-2xl shadow-2xl"
        style={{
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
        }}
      >
        <DialogHeader>
          <DialogTitle>Share Workspace</DialogTitle>
          <DialogDescription>
            Share this link to allow others to fork your workspace. They'll get their own copy—changes to their copy won't affect your original.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="share-url">Share Link</Label>
            <div className="flex gap-2">
              <Input
                id="share-url"
                value={shareUrl}
                readOnly
                className="font-mono text-sm"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleCopy}
                className="flex-shrink-0"
              >
                {copied ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
            {copied && (
              <p className="text-sm text-muted-foreground">Copied to clipboard!</p>
            )}
          </div>

          <div className="space-y-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleEmailShare}
              className="w-full flex items-center gap-2"
            >
              <Mail className="h-4 w-4" />
              <span>Share via Email</span>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

