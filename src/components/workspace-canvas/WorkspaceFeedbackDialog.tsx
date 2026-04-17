"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
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
import { Bug, Lightbulb, MessageSquare } from "lucide-react";

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
  const [feedbackType, setFeedbackType] = useState<
    FeedbackType | undefined
  >(undefined);
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
      setFeedbackType(undefined);
      setFeedback("");
    }
  }, [open, isSubmitting]);

  const handleSubmit = useCallback(() => {
    const trimmedFeedback = feedback.trim();
    if (!feedbackType || !trimmedFeedback) {
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
    setFeedbackType(undefined);
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

  const canSubmit =
    Boolean(feedbackType) && feedback.trim().length > 0 && !isSubmitting;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form
          className="contents"
          onSubmit={(e) => {
            e.preventDefault();
            if (canSubmit) handleSubmit();
          }}
        >
          <DialogHeader>
            <DialogTitle>Share feedback</DialogTitle>
            <DialogDescription>
              What can we do to improve our app?
            </DialogDescription>
          </DialogHeader>

          <FieldGroup className="gap-4">
            <Field>
              <Label htmlFor="workspace-feedback-type">Type</Label>
              <Select
                value={feedbackType}
                onValueChange={(value) => setFeedbackType(value as FeedbackType)}
                required
              >
                <SelectTrigger
                  id="workspace-feedback-type"
                  className="w-full"
                >
                  <SelectValue placeholder="Select feedback type" />
                </SelectTrigger>
                <SelectContent className="z-[100]">
                  <SelectItem value="bug">
                    <span className="flex items-center gap-2">
                      <Bug
                        className="size-4 shrink-0 text-muted-foreground"
                        aria-hidden
                      />
                      Bug / something broken
                    </span>
                  </SelectItem>
                  <SelectItem value="feature">
                    <span className="flex items-center gap-2">
                      <Lightbulb
                        className="size-4 shrink-0 text-muted-foreground"
                        aria-hidden
                      />
                      Feature request
                    </span>
                  </SelectItem>
                  <SelectItem value="other">
                    <span className="flex items-center gap-2">
                      <MessageSquare
                        className="size-4 shrink-0 text-muted-foreground"
                        aria-hidden
                      />
                      Other
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <Field>
              <Label htmlFor="workspace-feedback-message">Feedback</Label>
              <Textarea
                id="workspace-feedback-message"
                name="feedback"
                placeholder="Tell us what's on your mind..."
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                rows={5}
                className="resize-none"
                required
                autoFocus
              />
            </Field>
          </FieldGroup>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isSubmitting}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={!canSubmit}>
              {isSubmitting ? "Submitting..." : "Submit feedback"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
