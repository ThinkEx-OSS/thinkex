"use client";

import { cn } from "@/lib/utils";
import {
  type CardColor,
  getCardAccentColor,
  getCardColorCSS,
} from "@/lib/workspace-state/colors";
import { Play, ChevronLeft, ChevronRight, CheckSquare } from "lucide-react";
import Image from "next/image";
import type { CSSProperties } from "react";

export type BackgroundCardType =
  | "folder"
  | "flashcard"
  | "document"
  | "pdf"
  | "youtube"
  | "quiz";

export interface FloatingCardData {
  type: BackgroundCardType;
  title?: string;
  content?: string;
  color?: CardColor;
  width?: string;
  height?: string;
  aspectRatio?: string;
  itemCount?: number;
  thumbnailUrl?: string;
}

interface FloatingCardProps {
  data: FloatingCardData;
  className?: string;
}

export function FloatingCard({ data, className }: FloatingCardProps) {
  const baseColor = data.color || "#3B82F6";
  const borderColor = getCardAccentColor(baseColor, 0.8);
  const themedCardStyle = {
    "--floating-card-bg-light": getCardColorCSS(baseColor, 0.4),
    "--floating-card-bg-dark": getCardColorCSS(baseColor, 0.3),
    "--floating-card-border": borderColor,
    "--floating-card-tab-bg": getCardColorCSS(baseColor, 0.4),
    "--floating-card-stack-top": getCardColorCSS(baseColor, 0.25),
    "--floating-card-stack-bottom": getCardColorCSS(baseColor, 0.15),
    "--floating-card-header-bg": getCardColorCSS(baseColor, 0.2),
  } as CSSProperties;

  if (data.type === "folder") {
    return (
      <div className={cn("relative group mb-4 break-inside-avoid", className)}>
        <div
          className="relative w-full aspect-[1.3] rounded-md overflow-hidden select-none"
          style={
            data.aspectRatio
              ? { ...themedCardStyle, aspectRatio: data.aspectRatio }
              : themedCardStyle
          }
        >
          <div
            className="absolute top-0 left-0 h-[10%] w-[35%] rounded-t-md border border-b-0 [background-color:var(--floating-card-tab-bg)] [border-color:var(--floating-card-border)]"
            style={{
              ...themedCardStyle,
              borderWidth: "1px",
            }}
          />

          <div
            className="absolute top-[10%] left-0 right-0 bottom-0 rounded-md rounded-tl-none border p-4 flex flex-col pt-[15%] [background-color:var(--floating-card-bg-light)] [border-color:var(--floating-card-border)] dark:[background-color:var(--floating-card-bg-dark)]"
            style={{
              ...themedCardStyle,
              borderWidth: "1px",
            }}
          >
            <h3 className="font-medium text-sm md:text-base mb-1 truncate text-muted dark:text-muted-foreground">
              {data.title || "New Folder"}
            </h3>
            <p className="text-xs text-muted dark:text-muted-foreground">
              {data.itemCount || 0} items
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (data.type === "quiz") {
    return (
      <div className={cn("relative group mb-4 break-inside-avoid", className)}>
        <div
          className="w-full aspect-[1.2] rounded-md border p-4 flex flex-col overflow-hidden select-none shadow-sm [background-color:var(--floating-card-bg-light)] [border-color:var(--floating-card-border)] dark:[background-color:var(--floating-card-bg-dark)]"
          style={themedCardStyle}
        >
          <div className="flex items-center gap-2 mb-3 pb-2 border-b">
            <CheckSquare className="w-4 h-4" style={{ color: baseColor }} />
            <h3 className="font-semibold text-xs md:text-sm truncate text-muted dark:text-muted-foreground">
              {data.title || "Quiz"}
            </h3>
          </div>

          <p className="text-xs mb-3 line-clamp-2 text-muted dark:text-muted-foreground">
            {data.content || "What is the correct answer?"}
          </p>

          <div className="space-y-1.5 flex-1">
            {["A", "B", "C", "D"].map((option, i) => (
              <div
                key={option}
                className={cn(
                  "flex items-center gap-2 px-2 py-1 rounded text-[10px] md:text-xs",
                  i === 1
                    ? "bg-green-500/30 border border-green-500/50"
                    : "bg-muted/50 dark:bg-muted-foreground/20 border",
                )}
              >
                <span
                  className={cn(
                    "w-4 h-4 rounded-sm flex items-center justify-center text-[9px] font-medium",
                    i === 1
                      ? "bg-green-500/40 text-green-300"
                      : "bg-muted/50 dark:bg-muted-foreground/20 text-muted dark:text-muted-foreground",
                  )}
                >
                  {option}
                </span>
                <span
                  className={cn(
                    i === 1
                      ? "text-green-300/90"
                      : "text-muted dark:text-muted-foreground",
                  )}
                >
                  Option {option}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (data.type === "flashcard") {
    return (
      <div className={cn("relative group mb-4 break-inside-avoid", className)}>
        <div
          className="relative w-full aspect-[1.4] select-none"
          style={{ marginBottom: "6px" }}
        >
          <div
            className="absolute left-1 right-1 rounded-b-md z-0"
            style={{
              ...themedCardStyle,
              top: "100%",
              height: "6px",
              backgroundColor: "var(--floating-card-stack-top)",
            }}
          />
          <div
            className="absolute left-2 right-2 rounded-b-md z-[-1]"
            style={{
              ...themedCardStyle,
              top: "calc(100% + 4px)",
              height: "6px",
              backgroundColor: "var(--floating-card-stack-bottom)",
            }}
          />

          <div
            className="absolute inset-0 rounded-md border flex items-center justify-center p-6 text-center shadow-sm [background-color:var(--floating-card-bg-light)] [border-color:var(--floating-card-border)] dark:[background-color:var(--floating-card-bg-dark)]"
            style={themedCardStyle}
          >
            <p className="font-medium text-sm md:text-base line-clamp-4 leading-relaxed text-muted dark:text-muted-foreground">
              {data.content || "Flashcard content goes here..."}
            </p>
          </div>

          <div className="absolute bottom-3 left-0 right-0 flex items-center justify-center gap-4 px-4">
            <ChevronLeft className="w-4 h-4 text-muted dark:text-muted-foreground" />
            <div className="px-2 py-0.5 rounded-full bg-muted/50 dark:bg-muted-foreground/20 text-[10px] text-muted dark:text-muted-foreground">
              1 / 5
            </div>
            <ChevronRight className="w-4 h-4 text-muted dark:text-muted-foreground" />
          </div>
        </div>
      </div>
    );
  }

  if (data.type === "document") {
    return (
      <div className={cn("relative group mb-4 break-inside-avoid", className)}>
        <div
          className="w-full aspect-[0.8] rounded-md border p-4 flex flex-col overflow-hidden select-none shadow-sm [background-color:var(--floating-card-bg-light)] [border-color:var(--floating-card-border)] dark:[background-color:var(--floating-card-bg-dark)]"
          style={{
            ...themedCardStyle,
            ...(data.aspectRatio ? { aspectRatio: data.aspectRatio } : {}),
          }}
        >
          <div className="flex items-center justify-between mb-3 pb-2 border-b">
            <h3 className="font-semibold text-xs md:text-sm truncate w-3/4 text-muted dark:text-muted-foreground">
              {data.title || "Untitled Document"}
            </h3>
          </div>

          <div className="space-y-2 opacity-80">
            <div className="h-2 w-full bg-muted/30 dark:bg-muted-foreground/30 rounded-sm" />
            <div className="h-2 w-5/6 bg-muted/30 dark:bg-muted-foreground/30 rounded-sm" />
            <div className="h-2 w-4/6 bg-muted/30 dark:bg-muted-foreground/30 rounded-sm" />
            <div className="h-2 w-full bg-muted/30 dark:bg-muted-foreground/30 rounded-sm" />
            <div className="h-2 w-3/4 bg-muted/30 dark:bg-muted-foreground/30 rounded-sm mt-4" />
            <div className="h-2 w-1/2 bg-muted/30 dark:bg-muted-foreground/30 rounded-sm" />
          </div>
        </div>
      </div>
    );
  }

  if (data.type === "pdf") {
    return (
      <div className={cn("relative group mb-4 break-inside-avoid", className)}>
        <div
          className="w-full aspect-[0.75] rounded-md border p-0 flex flex-col overflow-hidden select-none shadow-sm [background-color:var(--floating-card-bg-light)] [border-color:var(--floating-card-border)] dark:[background-color:var(--floating-card-bg-dark)]"
          style={{
            ...themedCardStyle,
            ...(data.aspectRatio ? { aspectRatio: data.aspectRatio } : {}),
          }}
        >
          <div
            className="p-3 border-b flex items-center gap-2"
            style={{
              ...themedCardStyle,
              backgroundColor: "var(--floating-card-header-bg)",
            }}
          >
            <div className="w-3 h-3 rounded-full bg-red-500/70" />
            <h3 className="font-medium text-xs truncate flex-1 text-muted dark:text-muted-foreground">
              {data.title || "Document.pdf"}
            </h3>
          </div>

          <div className="flex-1 p-4 flex flex-col gap-2">
            <div className="w-3/4 h-2 bg-muted/35 dark:bg-muted-foreground/35 rounded-sm" />
            <div className="w-full h-2 bg-muted/35 dark:bg-muted-foreground/35 rounded-sm" />
            <div className="w-full h-2 bg-muted/35 dark:bg-muted-foreground/35 rounded-sm" />
            <div className="w-5/6 h-2 bg-muted/35 dark:bg-muted-foreground/35 rounded-sm" />
            <div className="w-full h-2 bg-muted/35 dark:bg-muted-foreground/35 rounded-sm mt-2" />
            <div className="w-4/5 h-2 bg-muted/35 dark:bg-muted-foreground/35 rounded-sm" />
          </div>
        </div>
      </div>
    );
  }

  if (data.type === "youtube") {
    return (
      <div className={cn("relative group mb-4 break-inside-avoid", className)}>
        <div
          className="relative w-full aspect-video rounded-md overflow-hidden border shadow-sm select-none [background-color:var(--floating-card-bg-light)] [border-color:var(--floating-card-border)] dark:[background-color:var(--floating-card-bg-dark)]"
          style={themedCardStyle}
        >
          {data.thumbnailUrl ? (
            <Image
              src={data.thumbnailUrl}
              alt="YouTube Thumbnail"
              fill
              loading="eager"
              className="object-cover opacity-80"
              sizes="(max-width: 768px) 50vw, 33vw"
            />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center [background-color:var(--floating-card-bg-light)] dark:[background-color:var(--floating-card-bg-dark)]"
              style={themedCardStyle}
            >
              <Play className="w-8 h-8 text-muted dark:text-muted-foreground" />
            </div>
          )}

          <div className="absolute inset-0 flex items-center justify-center bg-foreground/20">
            <div className="w-10 h-10 rounded-full bg-red-600 flex items-center justify-center shadow-lg">
              <Play className="w-5 h-5 text-foreground ml-0.5 fill-foreground dark:text-white dark:fill-white" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
