"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { QuizProgressState } from "@/lib/workspace-state/quiz-progress-types";

const DEBOUNCE_MS = 500;

export function useQuizProgress(workspaceId: string, itemId: string) {
  const [progress, setProgress] = useState<QuizProgressState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;

    fetch(
      `/api/workspace/${workspaceId}/quiz-progress?itemId=${encodeURIComponent(itemId)}`,
      { signal: controller.signal },
    )
      .then((res) => res.json())
      .then((data) => setProgress(data.state ?? null))
      .catch((err) => {
        if (err.name !== "AbortError") {
          console.error("[useQuizProgress] load failed", err);
        }
      })
      .finally(() => setIsLoading(false));

    return () => {
      controller.abort();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [workspaceId, itemId]);

  const saveProgress = useCallback(
    (state: QuizProgressState) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        fetch(`/api/workspace/${workspaceId}/quiz-progress`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemId, state }),
        }).catch((err) =>
          console.error("[useQuizProgress] save failed", err),
        );
      }, DEBOUNCE_MS);
    },
    [workspaceId, itemId],
  );

  const updateProgress = useCallback(
    (state: QuizProgressState) => {
      setProgress(state);
      saveProgress(state);
    },
    [saveProgress],
  );

  const clearProgress = useCallback(() => {
    setProgress(null);
  }, []);

  return { progress, isLoading, updateProgress, clearProgress };
}
