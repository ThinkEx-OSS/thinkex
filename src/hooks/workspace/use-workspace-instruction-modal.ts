"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

export type WorkspaceInstructionMode = "first-open";

type CloseReason = "manual" | "fallback_continue";

interface AnalyticsClient {
  capture: (event: string, properties?: Record<string, unknown>) => void;
}

const INTRO_SEEN_KEY = "thinkex:intro-modal-seen";

interface UseWorkspaceInstructionModalParams {
  workspaceId: string | null;
  assistantIsRunning: boolean | null;
  analytics?: AnalyticsClient | null;
}

interface UseWorkspaceInstructionModalResult {
  open: boolean;
  mode: WorkspaceInstructionMode | null;
  canClose: boolean;
  showFallback: boolean;
  isGenerating: boolean;
  close: () => void;
  continueFromFallback: () => void;
  markInteracted: () => void;
}

const FIRST_OPEN_UNLOCK_MS = 3000;

export function useWorkspaceInstructionModal({
  workspaceId,
  analytics,
}: UseWorkspaceInstructionModalParams): UseWorkspaceInstructionModalResult {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<WorkspaceInstructionMode | null>(null);
  const [canClose, setCanClose] = useState(false);

  // Remnants of autogen that are no longer used but kept to satisfy interface if needed, 
  // though we should ideally clean the interface too. 
  // For now, hardcode them to defaults.
  const showFallback = false;

  const startTimeRef = useRef<number | null>(null);
  const shownSignatureRef = useRef<string | null>(null);

  const track = useCallback(
    (event: string, properties: Record<string, unknown>) => {
      analytics?.capture(event, properties);
    },
    [analytics]
  );

  const closeInternal = useCallback(
    (reason: CloseReason) => {
      if (!open || !mode) return;

      const timeToCloseMs = startTimeRef.current ? Date.now() - startTimeRef.current : undefined;
      const common = {
        mode,
        workspace_id: workspaceId,
        close_reason: reason,
        time_to_close_ms: timeToCloseMs,
      };

      if (reason === "fallback_continue") {
        track("workspace-instruction-modal-fallback-continued", common);
      } else {
        track("workspace-instruction-modal-closed", common);
      }

      setOpen(false);
      setMode(null);
      setCanClose(false);
      startTimeRef.current = null;
      shownSignatureRef.current = null;
    },
    [mode, open, track, workspaceId]
  );

  const close = useCallback(() => {
    if (!open || mode !== "first-open" || !canClose) return;
    closeInternal("manual");
  }, [canClose, closeInternal, mode, open]);

  const continueFromFallback = useCallback(() => {
    // No-op since autogen is removed
  }, []);

  const markInteracted = useCallback(() => {
    // No-op
  }, []);

  // Handle First Open Logic
  useEffect(() => {
    if (!workspaceId) {
      setOpen(false);
      setMode(null);
      setCanClose(false);
      shownSignatureRef.current = null;
      startTimeRef.current = null;
      return;
    }

    // First workspace ever — show intro modal (once, persisted via localStorage)
    try {
      if (!localStorage.getItem(INTRO_SEEN_KEY)) {
        localStorage.setItem(INTRO_SEEN_KEY, "1");
        setOpen(true);
        setMode("first-open");
        setCanClose(false);
      }
    } catch {
      // localStorage unavailable (SSR, private browsing quota) — skip
    }
  }, [workspaceId]);

  // Tracking
  useEffect(() => {
    if (!open || !mode) return;

    const signature = `${mode}|${workspaceId}`;
    if (shownSignatureRef.current === signature) return;

    shownSignatureRef.current = signature;
    startTimeRef.current = Date.now();

    track("workspace-instruction-modal-shown", {
      mode,
      workspace_id: workspaceId,
    });
  }, [mode, open, track, workspaceId]);

  // Timer to allow closing
  useEffect(() => {
    if (!open) return;

    const timeoutId = window.setTimeout(() => {
      setCanClose(true);
    }, FIRST_OPEN_UNLOCK_MS);

    return () => window.clearTimeout(timeoutId);
  }, [open]);

  return {
    open,
    mode,
    canClose,
    showFallback,
    isGenerating: false, // Always false
    close,
    continueFromFallback,
    markInteracted,
  };
}
