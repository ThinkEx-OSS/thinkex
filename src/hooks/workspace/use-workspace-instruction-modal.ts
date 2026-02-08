"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getNewWorkspaceInstructionKeys } from "@/lib/workspace/instruction-modal";

export type WorkspaceInstructionMode = "first-open" | "autogen";

type CloseReason = "manual" | "autogen_complete" | "fallback_continue";

interface AnalyticsClient {
  capture: (event: string, properties?: Record<string, unknown>) => void;
}

interface UseWorkspaceInstructionModalParams {
  workspaceId: string | null;
  userId: string | null;
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

const FIRST_OPEN_UNLOCK_MS = 7000;
const AUTOGEN_FALLBACK_MS = 45000;

export function useWorkspaceInstructionModal({
  workspaceId,
  userId,
  assistantIsRunning,
  analytics,
}: UseWorkspaceInstructionModalParams): UseWorkspaceInstructionModalResult {
  const searchParams = useSearchParams();
  const createFrom = searchParams.get("createFrom");
  const action = searchParams.get("action");
  const isAutogenRoute = Boolean(createFrom) || action === "generate_study_materials";

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<WorkspaceInstructionMode | null>(null);
  const [canClose, setCanClose] = useState(false);
  const [showFallback, setShowFallback] = useState(false);
  const [generationComplete, setGenerationComplete] = useState(false);

  const startTimeRef = useRef<number | null>(null);
  const shownSignatureRef = useRef<string | null>(null);
  const seenRunningInCurrentAutogenRef = useRef(false);
  const userInteractedRef = useRef(false);
  const dismissedAutogenSignaturesRef = useRef<Set<string>>(new Set());

  const safeUserId = userId ?? "anonymous";
  const firstOpenStorageKey = `workspace-instruction-first-open:${safeUserId}`;
  const newWorkspaceStorageKeys = useMemo(() => {
    if (!workspaceId) return [] as string[];
    return getNewWorkspaceInstructionKeys(userId, workspaceId);
  }, [userId, workspaceId]);

  const autogenSignature = useMemo(() => {
    return `${workspaceId ?? "none"}|${createFrom ?? ""}|${action ?? ""}`;
  }, [workspaceId, createFrom, action]);

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

      if (reason === "autogen_complete") {
        track("workspace-instruction-modal-autoclosed", common);
      }
      if (reason === "fallback_continue") {
        track("workspace-instruction-modal-fallback-continued", common);
      }

      track("workspace-instruction-modal-closed", common);

      if (mode === "autogen") {
        dismissedAutogenSignaturesRef.current.add(autogenSignature);
      }

      setOpen(false);
      setMode(null);
      setCanClose(false);
      setShowFallback(false);
      setGenerationComplete(false);
      seenRunningInCurrentAutogenRef.current = false;
      userInteractedRef.current = false;
      startTimeRef.current = null;
      shownSignatureRef.current = null;
    },
    [autogenSignature, mode, open, track, workspaceId]
  );

  const close = useCallback(() => {
    if (!open || mode !== "first-open" || !canClose) return;
    closeInternal("manual");
  }, [canClose, closeInternal, mode, open]);

  const continueFromFallback = useCallback(() => {
    if (!open || mode !== "autogen") return;
    closeInternal("fallback_continue");
  }, [closeInternal, mode, open]);

  const markInteracted = useCallback(() => {
    userInteractedRef.current = true;
  }, []);

  useEffect(() => {
    if (!workspaceId) {
      setOpen(false);
      setMode(null);
      setCanClose(false);
      setShowFallback(false);
      seenRunningInCurrentAutogenRef.current = false;
      shownSignatureRef.current = null;
      startTimeRef.current = null;
      return;
    }

    if (isAutogenRoute) {
      try {
        window.localStorage.setItem(firstOpenStorageKey, "true");
      } catch {
        // no-op: storage unavailable
      }

      if (!dismissedAutogenSignaturesRef.current.has(autogenSignature)) {
        setOpen(true);
        setMode("autogen");
        setCanClose(false);
        setShowFallback(false);
        seenRunningInCurrentAutogenRef.current = false;
      }
      return;
    }

    if (open && mode === "autogen") {
      return;
    }

    let isNewWorkspaceTrigger = false;
    try {
      isNewWorkspaceTrigger = newWorkspaceStorageKeys.some(
        (storageKey) => window.localStorage.getItem(storageKey) === "true"
      );
    } catch {
      isNewWorkspaceTrigger = false;
    }

    if (isNewWorkspaceTrigger) {
      try {
        newWorkspaceStorageKeys.forEach((storageKey) => window.localStorage.removeItem(storageKey));
      } catch {
        // no-op: storage unavailable
      }
      setOpen(true);
      setMode("first-open");
      setCanClose(false);
      setShowFallback(false);
      return;
    }

    let hasSeenFirstOpen = false;
    try {
      hasSeenFirstOpen = window.localStorage.getItem(firstOpenStorageKey) === "true";
    } catch {
      hasSeenFirstOpen = false;
    }

    if (!hasSeenFirstOpen) {
      try {
        window.localStorage.setItem(firstOpenStorageKey, "true");
      } catch {
        // no-op: storage unavailable
      }
      setOpen(true);
      setMode("first-open");
      setCanClose(false);
      setShowFallback(false);
      return;
    }

    // "first-open" modal only closes via explicit user action (Close button).
    // No catch-all auto-close needed — workspaceId change is handled by the
    // guard at the top of this effect, and autogen has its own close logic.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autogenSignature, firstOpenStorageKey, isAutogenRoute, newWorkspaceStorageKeys, workspaceId]);

  useEffect(() => {
    if (!open || !mode) return;

    const signature = `${mode}|${workspaceId}|${autogenSignature}`;
    if (shownSignatureRef.current === signature) return;

    shownSignatureRef.current = signature;
    startTimeRef.current = Date.now();

    track("workspace-instruction-modal-shown", {
      mode,
      workspace_id: workspaceId,
      create_from_present: Boolean(createFrom),
      action,
    });
  }, [action, autogenSignature, createFrom, mode, open, track, workspaceId]);

  useEffect(() => {
    if (!open || mode !== "first-open") return;

    const timeoutId = window.setTimeout(() => {
      setCanClose(true);
    }, FIRST_OPEN_UNLOCK_MS);

    return () => window.clearTimeout(timeoutId);
  }, [mode, open]);

  useEffect(() => {
    if (!open || mode !== "autogen") return;

    const timeoutId = window.setTimeout(() => {
      setShowFallback(true);
      track("workspace-instruction-modal-fallback-shown", {
        mode,
        workspace_id: workspaceId,
        timeout_ms: AUTOGEN_FALLBACK_MS,
      });
    }, AUTOGEN_FALLBACK_MS);

    return () => window.clearTimeout(timeoutId);
  }, [mode, open, track, workspaceId]);

  useEffect(() => {
    if (!open || mode !== "autogen") return;

    if (assistantIsRunning === true) {
      seenRunningInCurrentAutogenRef.current = true;
      return;
    }

    if (assistantIsRunning === false && seenRunningInCurrentAutogenRef.current) {
      if (userInteractedRef.current) {
        setGenerationComplete(true);
      } else {
        closeInternal("autogen_complete");
      }
    }
  }, [assistantIsRunning, closeInternal, mode, open]);

  const isGenerating = open && mode === "autogen" && !generationComplete;

  return {
    open,
    mode,
    canClose,
    showFallback,
    isGenerating,
    close,
    continueFromFallback,
    markInteracted,
  };
}
