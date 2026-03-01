"use client";

import { useCallback, useEffect, useRef, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { WorkspaceInstructionModal } from "@/components/onboarding/WorkspaceInstructionModal";
import { Button } from "@/components/ui/button";
import { HomeLayout } from "@/components/layout/HomeLayout";
import { AnonymousSessionHandler } from "@/components/layout/SessionHandler";
import { WorkspaceProvider } from "@/contexts/WorkspaceContext";
import { MobileWarning } from "@/components/ui/MobileWarning";
import { FloatingWorkspaceCards } from "@/components/landing/FloatingWorkspaceCards";
import { ATTACHMENTS_SESSION_KEY } from "@/contexts/HomeAttachmentsContext";

const PROGRESS_LABELS: Record<string, string> = {
  understanding: "Understanding content...",
  metadata: "Generating workspace title...",
  workspace: "Creating your workspace...",
  note: "Creating your note...",
  quiz: "Creating your quiz...",
  flashcards: "Creating your flashcards...",
  youtube: "Adding a video...",
  complete: "Done! Opening your workspace...",
};

const PROGRESS_STEPS = ["understanding", "metadata", "workspace", "note", "quiz", "flashcards", "youtube"] as const;

function GenerateContent() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const prompt = searchParams.get("prompt")?.trim();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [progressText, setProgressText] = useState("Your workspace is generating...");
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);
  const [userInteracted, setUserInteracted] = useState(false);
  const [generationCompleteSlug, setGenerationCompleteSlug] = useState<string | null>(null);
  const userInteractedRef = useRef(false);
  const isRedirectingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  userInteractedRef.current = userInteracted;

  const runAutogen = useCallback(async () => {
    if (!prompt) return;

    abortControllerRef.current?.abort();
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    const signal = abortController.signal;

    setError(null);
    setIsLoading(true);
    setCompletedSteps([]);
    setGenerationCompleteSlug(null);
    setUserInteracted(false);
    isRedirectingRef.current = false;
    setProgressText("Understanding content...");

    let fileUrls: Array<{ url: string; mediaType: string; filename?: string; fileSize?: number }> = [];
    let links: string[] = [];
    try {
      const stored = sessionStorage.getItem(ATTACHMENTS_SESSION_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as {
          fileUrls?: typeof fileUrls;
          links?: string[];
        };
        fileUrls = parsed.fileUrls ?? [];
        links = parsed.links ?? [];
        sessionStorage.removeItem(ATTACHMENTS_SESSION_KEY);
      }
    } catch {
      // Ignore parse errors
    }

    const applyIfNotAborted = <T extends (...args: never[]) => void>(fn: T) => {
      if (!signal.aborted) fn();
    };

    try {
      const res = await fetch("/api/workspaces/autogen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, ...(fileUrls.length > 0 && { fileUrls }), ...(links.length > 0 && { links }) }),
        signal,
      });

      if (signal.aborted) return;

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        applyIfNotAborted(() => setError(data.error || "Failed to create workspace"));
        return;
      }

      const reader = res.body.getReader();
      readerRef.current = reader;
      const decoder = new TextDecoder();
      let buffer = "";

      while (!signal.aborted) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (signal.aborted) break;
          if (!line.trim()) continue;
          try {
            const ev = JSON.parse(line) as {
              type: string;
              data?: {
                message?: string;
                workspace?: { slug?: string };
                step?: string;
                stage?: string;
                partial?: Record<string, unknown>;
                toolName?: string;
                query?: string;
              };
            };

            if (ev.type === "phase" && ev.data?.stage === "understanding") {
              applyIfNotAborted(() => setProgressText("Understanding content..."));
            } else if (ev.type === "toolCall" && ev.data?.toolName === "webSearch" && ev.data?.query) {
              const q = ev.data.query;
              applyIfNotAborted(() =>
                setProgressText(`Searching the web for: "${q.length > 50 ? q.slice(0, 50) + "..." : q}"`)
              );
            } else if (ev.type === "toolResult" && ev.data?.toolName === "webSearch") {
              applyIfNotAborted(() => setProgressText("Processing search results..."));
            } else if (ev.type === "partial" && ev.data?.partial) {
              const p = ev.data.partial as Record<string, unknown>;
              const stage = ev.data.stage as string;
              if (stage === "metadata" && typeof p.title === "string" && p.title) {
                applyIfNotAborted(() => setProgressText(`Workspace: ${p.title}${p.icon || p.color ? "..." : ""}`));
              } else if (stage === "distillation" && p.metadata && typeof (p.metadata as Record<string, unknown>).title === "string") {
                const t = (p.metadata as Record<string, unknown>).title as string;
                if (t) applyIfNotAborted(() => setProgressText(`Workspace: ${t}...`));
              } else if (stage === "noteFlashcards") {
                const note = p.note as Record<string, unknown> | undefined;
                const fc = p.flashcards as Record<string, unknown> | undefined;
                if (typeof note?.title === "string" && note.title) {
                  applyIfNotAborted(() => setProgressText(`Creating note: ${note.title}...`));
                } else if (typeof fc?.title === "string" && fc.title) {
                  applyIfNotAborted(() => setProgressText(`Creating flashcards: ${fc.title}...`));
                }
              }
            } else if (ev.type === "metadata") {
              setCompletedSteps((s) => (s.includes("metadata") ? s : [...s, "metadata"]));
              applyIfNotAborted(() => setProgressText(PROGRESS_LABELS.workspace));
            } else if (ev.type === "workspace") {
              setCompletedSteps((s) => (s.includes("workspace") ? s : [...s, "workspace"]));
              applyIfNotAborted(() => setProgressText("Creating your note, quiz, flashcards, and video..."));
            } else if (ev.type === "progress" && ev.data?.step) {
              const step = ev.data.step;
              setCompletedSteps((s) => (s.includes(step) ? s : [...s, step]));
              applyIfNotAborted(() => setProgressText(PROGRESS_LABELS[step] ?? `Creating ${step}...`));
            } else if (ev.type === "complete" && ev.data?.workspace?.slug) {
              readerRef.current = null;
              applyIfNotAborted(() => setProgressText(PROGRESS_LABELS.complete));
              if (!signal.aborted) await queryClient.invalidateQueries({ queryKey: ["workspaces"] });
              if (signal.aborted) return;
              if (userInteractedRef.current) {
                const slug = ev.data.workspace.slug ?? null;
                applyIfNotAborted(() => setGenerationCompleteSlug(slug));
                applyIfNotAborted(() => setIsLoading(false));
              } else {
                isRedirectingRef.current = true;
                router.replace(`/workspace/${ev.data!.workspace!.slug}`);
              }
              return;
            } else if (ev.type === "error" && ev.data?.message) {
              readerRef.current = null;
              applyIfNotAborted(() => setError(ev.data!.message!));
              return;
            }
          } catch (_) {
            // Skip malformed lines
          }
        }
      }

      if (signal.aborted) return;
      readerRef.current = null;

      // Stream ended without complete event
      applyIfNotAborted(() => setError("Invalid response from server"));
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      applyIfNotAborted(() => setError(err instanceof Error ? err.message : "Something went wrong"));
    } finally {
      readerRef.current = null;
      abortControllerRef.current = null;
      if (!isRedirectingRef.current) {
        setIsLoading(false);
      }
    }
  }, [prompt, router, queryClient]);

  useEffect(() => {
    if (!prompt) {
      router.replace("/home");
      return;
    }
    runAutogen();
    return () => {
      abortControllerRef.current?.abort();
      readerRef.current?.cancel().catch(() => {});
    };
  }, [prompt, router, runAutogen]);

  useEffect(() => {
    if (error) {
      toast.error(error);
    }
  }, [error]);

  if (!prompt) {
    return null; // Redirecting
  }

  return (
    <div className="relative min-h-screen w-full">
      {/* Floating card background — fixed so it covers viewport behind modal */}
      <div className="fixed inset-0 z-[1] select-none pointer-events-none">
        <FloatingWorkspaceCards bottomGradientHeight="50%" includeExtraCards clearerBackground />
      </div>

      <div className="relative z-10 flex min-h-[60vh] flex-col items-center justify-center">
        <WorkspaceInstructionModal
          open={!error}
          canClose={false}
          showFallback={false}
          isGenerating={isLoading && !error}
          progressText={progressText}
          completedSteps={completedSteps}
          totalSteps={PROGRESS_STEPS.length}
          onUserInteracted={() => setUserInteracted(true)}
          generationComplete={!!generationCompleteSlug}
          workspaceSlug={generationCompleteSlug}
          onOpenWorkspace={
            generationCompleteSlug
              ? () => router.replace(`/workspace/${generationCompleteSlug}`)
              : undefined
          }
        />
      {error && (
        <div className="flex flex-col items-center gap-4 p-6 bg-background/80 backdrop-blur-sm rounded-xl border border-border/50">
          <p className="text-sm text-muted-foreground">{error}</p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={runAutogen}>
              Retry
            </Button>
            <Button variant="default" onClick={() => router.replace("/home")}>
              Back to home
            </Button>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

export default function GeneratePage() {
  return (
    <>
      <MobileWarning />
      <AnonymousSessionHandler>
        <WorkspaceProvider>
          <HomeLayout>
            <Suspense fallback={<div className="flex min-h-[60vh] items-center justify-center">Loading...</div>}>
              <GenerateContent />
            </Suspense>
          </HomeLayout>
        </WorkspaceProvider>
      </AnonymousSessionHandler>
    </>
  );
}
