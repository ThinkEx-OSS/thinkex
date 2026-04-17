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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { posthog } from "@/lib/posthog-client";
import { toast } from "sonner";

const SURVEY_ID = "019d934f-3f98-0000-1f14-af80eef4dcb0";

type FeedbackType = "bug" | "feature" | "other";

interface WorkspaceFeedbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WorkspaceFeedbackDialog({
  open,
  onOpenChange,
}: WorkspaceFeedbackDialogProps) {
  const [feedbackType, setFeedbackType] = useState<FeedbackType>("other");
  const [feedback, setFeedback] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const hasCapturedShown = useRef(false);
  const didSubmitRef = useRef(false);

  useEffect(() => {
    if (open) {
      didSubmitRef.current = false;

      if (!hasCapturedShown.current) {
        posthog.capture("survey shown", { $survey_id: SURVEY_ID });
        hasCapturedShown.current = true;
      }

      return;
    }

    hasCapturedShown.current = false;

    if (!isSubmitting) {
      setFeedbackType("other");
      setFeedback("");
    }
  }, [open, isSubmitting]);

  const handleSubmit = useCallback(() => {
    const trimmedFeedback = feedback.trim();
    if (!trimmedFeedback) {
      return;
    }

    setIsSubmitting(true);
    didSubmitRef.current = true;

    posthog.capture("survey sent", {
      $survey_id: SURVEY_ID,
      $survey_response: trimmedFeedback,
      feedback_type: feedbackType,
    });

    toast.success("Feedback submitted—thank you!");
    setFeedback("");
    setFeedbackType("other");
    onOpenChange(false);
    setIsSubmitting(false);
  }, [feedback, feedbackType, onOpenChange]);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen && !didSubmitRef.current) {
        posthog.capture("survey dismissed", { $survey_id: SURVEY_ID });
      }

      onOpenChange(nextOpen);
    },
    [onOpenChange],
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share feedback</DialogTitle>
          <DialogDescription>
            What can we do to improve our app?
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <label className="grid gap-2">
            <span className="text-sm font-medium">Type</span>
            <Select
              value={feedbackType}
              onValueChange={(value) => setFeedbackType(value as FeedbackType)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bug">Bug / something broken</SelectItem>
                <SelectItem value="feature">Feature request</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-medium">Feedback</span>
            <Textarea
              placeholder="Tell us what's on your mind..."
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              rows={5}
              className="resize-none"
            />
          </label>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || feedback.trim().length === 0}
          >
            {isSubmitting ? "Submitting..." : "Submit feedback"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
