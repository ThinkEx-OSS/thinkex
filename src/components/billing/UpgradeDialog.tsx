"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface UpgradeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UpgradeDialog({ open, onOpenChange }: UpgradeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>You're out of premium messages</DialogTitle>
          <DialogDescription>
            You've used all your premium AI messages for this month. You can
            still use Gemini Flash, Claude Haiku, and GPT-5 for free — they're
            unlimited.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4 flex flex-col gap-2">
          <Button
            onClick={() => {
              window.location.href = "/billing";
            }}
          >
            Upgrade to Pro
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Continue with other models
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
