"use client";

import { useEffect, useMemo, useState } from "react";
import { X, Move, SquarePen, FileSearch, Youtube, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { WorkspaceInstructionMode } from "@/hooks/workspace/use-workspace-instruction-modal";

export interface WorkspaceInstructionModalProps {
  mode: WorkspaceInstructionMode;
  open: boolean;
  canClose: boolean;
  showFallback: boolean;
  onRequestClose?: () => void;
  onFallbackContinue?: () => void;
  mediaSrc?: string;
  useStaticFallback?: boolean;
}

const STEP_COPY = [
  { icon: Move, label: "Drag cards" },
  { icon: SquarePen, label: "Create a note" },
  { icon: FileSearch, label: "PDF text/image to chat" },
  { icon: Youtube, label: "Add YouTube from chat" },
  { icon: Share2, label: "Share workspace" },
];

function InstructionVisual({ mediaSrc, useStaticFallback = true }: { mediaSrc?: string; useStaticFallback?: boolean }) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (mediaSrc && !useStaticFallback) return;
    const id = window.setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % STEP_COPY.length);
    }, 1700);
    return () => window.clearInterval(id);
  }, [mediaSrc, useStaticFallback]);

  if (mediaSrc && !useStaticFallback) {
    const isVideo = /\.(mp4|webm|ogg)$/i.test(mediaSrc);
    return (
      <div className="h-full w-full overflow-hidden rounded-[22px] border border-black/10 bg-black/5">
        {isVideo ? (
          <video src={mediaSrc} className="h-full w-full object-cover" autoPlay muted loop playsInline />
        ) : (
          <img src={mediaSrc} alt="Thinkex instructional visual" className="h-full w-full object-cover" />
        )}
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden rounded-[22px] border border-sidebar-border bg-gradient-to-br from-sidebar via-sidebar to-muted/40 p-5">
      <div className="absolute -left-20 -top-20 h-44 w-44 rounded-full bg-primary/10 blur-3xl" />
      <div className="absolute -bottom-20 -right-20 h-52 w-52 rounded-full bg-accent/20 blur-3xl" />

      <div className="relative grid h-full grid-cols-1 gap-2 md:grid-cols-2">
        {STEP_COPY.map((step, index) => {
          const Icon = step.icon;
          const active = index === activeIndex;
          return (
            <div
              key={step.label}
              className={cn(
                "flex items-center gap-3 rounded-xl border px-3 py-2 transition-all duration-500",
                active
                  ? "border-primary/40 bg-primary text-primary-foreground shadow-lg"
                  : "border-sidebar-border bg-sidebar/80 text-sidebar-foreground"
              )}
            >
              <div
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-md text-xs font-medium",
                  active ? "bg-primary-foreground/20 text-primary-foreground" : "bg-sidebar-accent text-sidebar-foreground/80"
                )}
              >
                {index + 1}
              </div>
              <Icon className={cn("h-4 w-4", active ? "text-primary-foreground" : "text-sidebar-foreground/80")} />
              <span className="text-xs font-medium md:text-sm">{step.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function WorkspaceInstructionModal({
  mode,
  open,
  canClose,
  showFallback,
  onRequestClose,
  onFallbackContinue,
  mediaSrc,
  useStaticFallback = true,
}: WorkspaceInstructionModalProps) {
  const copy = useMemo(() => {
    return mode === "autogen" ? "Your workspace is being generated" : "Welcome to Thinkex";
  }, [mode]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 px-4 py-6 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label="Workspace instruction"
    >
      <div className="w-full max-w-[980px] rounded-[28px] border border-sidebar-border/70 bg-sidebar p-2 shadow-[0_28px_100px_rgba(0,0,0,0.35)]">
        <div className="flex h-[520px] flex-col rounded-[24px] border border-sidebar-border bg-sidebar/95">
          <div className="relative min-h-0 flex-1 p-4 md:p-5">
            <InstructionVisual mediaSrc={mediaSrc} useStaticFallback={useStaticFallback} />
          </div>

          <div className="relative flex min-h-[84px] items-center rounded-b-[24px] border-t border-sidebar-border bg-sidebar px-5">
            <p className="pr-40 text-sm font-medium text-sidebar-foreground md:text-base">{copy}</p>

            {mode === "first-open" && canClose && (
              <Button
                type="button"
                size="sm"
                className="absolute bottom-4 right-4"
                onClick={onRequestClose}
              >
                <X className="mr-1 h-3.5 w-3.5" />
                Close
              </Button>
            )}

            {mode === "autogen" && showFallback && (
              <Button
                type="button"
                size="sm"
                className="absolute bottom-4 right-4"
                onClick={onFallbackContinue}
              >
                Continue to workspace
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
