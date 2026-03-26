"use client";

import { useState, useCallback } from "react";
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
import { posthog } from "@/lib/posthog-client";
import { toast } from "sonner";

interface AIFeedbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AIFeedbackDialog({ open, onOpenChange }: AIFeedbackDialogProps) {
  const [feedback, setFeedback] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = useCallback(() => {
    setIsSubmitting(true);

    const trimmedFeedback = feedback.trim();

    posthog.capture("ai_debug_feedback_submitted", {
      feedback_text: trimmedFeedback,
    });

    toast.success("Feedback submitted—thank you!");
    setFeedback("");
    onOpenChange(false);
    setIsSubmitting(false);
  }, [feedback, onOpenChange]);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen && !isSubmitting) {
        setFeedback("");
      }
      onOpenChange(nextOpen);
    },
    [onOpenChange, isSubmitting]
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Report AI Issue</DialogTitle>
          <DialogDescription>
            What went wrong with the AI? Your feedback helps us improve.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Textarea
            placeholder="Describe what went wrong (optional)..."
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            rows={4}
            className="resize-none"
          />
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? "Submitting..." : "Submit Feedback"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
