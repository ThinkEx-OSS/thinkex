"use client";

import { useState } from "react";
import { useCustomer } from "autumn-js/react";
import { Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface UpgradeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UpgradeModal({ open, onOpenChange }: UpgradeModalProps) {
  const customerApi = useCustomer();
  const [isLoading, setIsLoading] = useState(false);

  const handleUpgrade = async () => {
    setIsLoading(true);
    try {
      const autumnApi = customerApi as unknown as {
        attach?: (params: Record<string, unknown>) => Promise<unknown>;
      };

      if (!autumnApi.attach) {
        throw new Error("Attach is not available");
      }

      try {
        await autumnApi.attach({ productId: "pro" });
      } catch {
        await autumnApi.attach({ planId: "pro" });
      }
    } catch {
      window.location.href = "/billing";
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-amber-500" />
            <DialogTitle>Premium messages used up</DialogTitle>
          </div>
          <DialogDescription>
            You&apos;ve used all your premium AI messages for this month. You
            can still use basic models like Gemini Flash, Claude Haiku, and
            GPT-5 for free.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4 space-y-3">
          <Button
            onClick={handleUpgrade}
            className="w-full"
            disabled={isLoading}
          >
            {isLoading ? "Loading..." : "Upgrade to Pro — Unlimited Messages"}
          </Button>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => onOpenChange(false)}
          >
            Continue with basic models
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
