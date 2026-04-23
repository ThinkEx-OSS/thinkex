"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Files, Gift, Link2, Mail } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSession } from "@/lib/auth-client";
import { useNewFeature } from "@/lib/utils/new-feature";
import type { WorkspaceWithState } from "@/lib/workspace-state/types";

interface RafflePopupProps {
  workspace: WorkspaceWithState | null;
  currentWorkspaceId: string | null;
  isLoadingWorkspace: boolean;
  onOpenFullShare?: () => void;
}

const FEATURE_KEY = "midterms-raffle-2026-04";
const FEATURE_END_DATE = new Date(2026, 3, 25, 23, 59, 59);

export function RafflePopup({
  workspace,
  currentWorkspaceId,
  isLoadingWorkspace,
  onOpenFullShare,
}: RafflePopupProps) {
  const { data: session } = useSession();
  const { isNew, dismiss } = useNewFeature({
    featureKey: FEATURE_KEY,
    endDate: FEATURE_END_DATE,
  });
  const [linkMode, setLinkMode] = useState<"collaborate" | "deepcopy">(
    "collaborate",
  );
  const [shareLinkUrl, setShareLinkUrl] = useState("");
  const [isLoadingShareLink, setIsLoadingShareLink] = useState(false);
  const [copied, setCopied] = useState(false);

  const canRender =
    !!currentWorkspaceId &&
    !isLoadingWorkspace &&
    !!workspace &&
    session?.user?.isAnonymous !== true &&
    workspace?.userId === session?.user?.id &&
    isNew;

  useEffect(() => {
    if (!canRender || !workspace) return;

    const controller = new AbortController();
    setIsLoadingShareLink(true);
    setShareLinkUrl("");

    fetch(`/api/workspaces/${workspace.id}/share-link`, {
      method: "POST",
      signal: controller.signal,
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.url) setShareLinkUrl(data.url);
      })
      .catch((err) => {
        if ((err as { name?: string } | null)?.name !== "AbortError") {
          console.error(err);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoadingShareLink(false);
      });

    return () => {
      controller.abort();
    };
  }, [canRender, workspace]);

  if (!canRender || !workspace) {
    return null;
  }

  const deepCopyUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/share-copy/${workspace.id}`;
  const activeUrl = linkMode === "collaborate" ? shareLinkUrl : deepCopyUrl;
  const isActiveLoading = linkMode === "collaborate" && isLoadingShareLink;

  const handleCopyShareLink = async () => {
    if (!activeUrl) return;

    try {
      await navigator.clipboard.writeText(activeUrl);
      setCopied(true);
      toast.success("Link copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };

  return (
    <Dialog
      open={isNew}
      onOpenChange={(next) => {
        if (!next) dismiss();
      }}
    >
      <DialogContent className="sm:max-w-md" overlayClassName="bg-black/70">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
              <Gift className="size-5 text-primary" />
            </div>
            <Badge
              variant="secondary"
              className="bg-amber-500/15 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400"
            >
              Raffle
            </Badge>
          </div>
          <DialogTitle className="mt-3">Win a $50 Amazon gift card</DialogTitle>
          <DialogDescription className="mt-2">
            Share this workspace with <strong>5 or more people</strong> and
            you'll be entered to win a <strong>$50 Amazon gift card</strong>.
            Copy your share link below and send it over — each person who joins
            counts.
          </DialogDescription>
        </DialogHeader>

        <div className="flex rounded-lg bg-muted p-1 gap-1">
          <button
            type="button"
            onClick={() => {
              setLinkMode("collaborate");
              setCopied(false);
            }}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all ${
              linkMode === "collaborate"
                ? "bg-background text-foreground shadow-sm ring-1 ring-border/50"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Link2 className="h-3.5 w-3.5" />
            Collaborative
          </button>
          <button
            type="button"
            onClick={() => {
              setLinkMode("deepcopy");
              setCopied(false);
            }}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all ${
              linkMode === "deepcopy"
                ? "bg-background text-foreground shadow-sm ring-1 ring-border/50"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Files className="h-3.5 w-3.5" />
            Share as Copy
          </button>
        </div>

        <div className="flex gap-2">
          <Input
            readOnly
            value={activeUrl}
            className="flex-1 font-mono text-sm bg-muted/50"
            placeholder={isActiveLoading ? "Loading..." : ""}
          />
          <Button
            onClick={handleCopyShareLink}
            disabled={!activeUrl || isActiveLoading}
            className="shrink-0"
          >
            {copied ? (
              <Check className="h-4 w-4" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
            <span className="ml-2">Copy</span>
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          {linkMode === "collaborate"
            ? "Adds them as a collaborator. Expires in 7 days."
            : "Recipient gets their own independent copy. Does not expire."}
        </p>

        <DialogFooter className="flex-row items-center gap-2 justify-between pt-2">
          {onOpenFullShare ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                dismiss();
                onOpenFullShare();
              }}
            >
              <Mail className="h-4 w-4" />
              <span className="ml-2">Invite by email</span>
            </Button>
          ) : (
            <span />
          )}
          <Button type="button" onClick={dismiss}>
            Got it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
