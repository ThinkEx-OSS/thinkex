"use client";

import { Loader2 } from "lucide-react";
import { Flashcard } from "react-quizlet-flashcard";
import "react-quizlet-flashcard/dist/index.css";
import { cn } from "@/lib/utils";
import type {
  Item,
  DocumentData,
  FlashcardData,
  PdfData,
  YouTubeData,
} from "@/lib/workspace-state/types";
import ItemHeader from "@/components/workspace-canvas/ItemHeader";
import { QuizContent } from "./QuizContent";
import { ImageCardContent } from "./ImageCardContent";
import { AudioCardContent } from "./AudioCardContent";
import LazyAppPdfViewer from "@/components/pdf/LazyAppPdfViewer";
import { StreamdownMarkdown } from "@/components/ui/streamdown-markdown";
import { Skeleton } from "@/components/ui/skeleton";
import {
  extractYouTubePlaylistId,
  extractYouTubeVideoId,
} from "@/lib/utils/youtube-url";
import { YouTubeCardContent } from "./YouTubeCardContent";
import { SourcesDisplay } from "./SourcesDisplay";

interface WorkspaceCardContentProps {
  item: Item;
  shouldShowPreview: boolean;
  isScrollLocked: boolean;
  documentAwaitingGeneration: boolean;
  documentPreviewText: string;
  resolvedTheme?: string;
  onNameChange: (value: string) => void;
  onNameCommit: (value: string) => void;
  onSubtitleChange: (value: string) => void;
  onTitleFocus: () => void;
  onTitleBlur: () => void;
  onUpdateItemData: (updater: (prev: Item["data"]) => Item["data"]) => void;
}

export function WorkspaceCardContent({
  item,
  shouldShowPreview,
  isScrollLocked,
  documentAwaitingGeneration,
  documentPreviewText,
  resolvedTheme,
  onNameChange,
  onNameCommit,
  onSubtitleChange,
  onTitleFocus,
  onTitleBlur,
  onUpdateItemData,
}: WorkspaceCardContentProps) {
  const isCompactTextCard =
    (item.type === "pdf" ||
      item.type === "quiz" ||
      item.type === "audio" ||
      item.type === "document") &&
    !shouldShowPreview;
  const shouldShowHeader =
    item.type !== "youtube" &&
    item.type !== "image" &&
    !(item.type === "pdf" && shouldShowPreview) &&
    item.name !== "Update me";
  const documentSources =
    item.type === "document" ? (item.data as DocumentData).sources : undefined;

  return (
    <>
      <div
        className={
          isCompactTextCard ? "flex-1 flex flex-col relative" : "flex-shrink-0"
        }
      >
        {shouldShowHeader && (
          <div className="relative z-10">
            <ItemHeader
              id={item.id}
              name={item.name}
              subtitle={item.subtitle}
              description=""
              onNameChange={onNameChange}
              onNameCommit={onNameCommit}
              onSubtitleChange={onSubtitleChange}
              readOnly={isCompactTextCard}
              noMargin={true}
              onTitleFocus={onTitleFocus}
              onTitleBlur={onTitleBlur}
              allowWrap={isCompactTextCard}
            />

            {item.type === "document" &&
              shouldShowPreview &&
              documentSources &&
              documentSources.length > 0 && (
                <div className="px-1 mt-2 mb-1">
                  <SourcesDisplay sources={documentSources} />
                </div>
              )}
          </div>
        )}
      </div>

      {item.type === "pdf" &&
        shouldShowPreview &&
        (() => {
          const pdfData = item.data as PdfData;
          const isOcrProcessing = pdfData?.ocrStatus === "processing";
          const pdfPreviewUrl = pdfData.fileUrl;

          return (
            <div
              className={cn(
                "flex-1 min-h-0 relative",
                isScrollLocked ? "overflow-hidden" : "overflow-auto",
              )}
              style={{ pointerEvents: isScrollLocked ? "none" : "auto" }}
            >
              <LazyAppPdfViewer
                pdfSrc={pdfPreviewUrl}
                itemId={item.id}
                itemName={item.name}
              />
              {isOcrProcessing && pdfPreviewUrl && (
                <div
                  className="absolute bottom-0 left-0 right-0 flex items-center justify-center gap-2 py-2 px-3 bg-primary/90 text-primary-foreground text-xs font-medium"
                  style={{ color: "inherit" }}
                >
                  <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                  Reading...
                </div>
              )}
            </div>
          );
        })()}

      {item.type === "quiz" && shouldShowPreview && (
        <div className="flex-1 min-h-0">
          <QuizContent
            item={item}
            onUpdateData={onUpdateItemData}
            isScrollLocked={isScrollLocked}
          />
        </div>
      )}

      {item.type === "flashcard" &&
        (() => {
          const flashcardData = item.data as FlashcardData;
          const firstCard = flashcardData.cards?.[0];
          const frontText = firstCard?.front?.trim()
            ? firstCard.front
            : "Click to add front content";
          const backText = firstCard?.back?.trim()
            ? firstCard.back
            : "Click to add back content";

          return (
            <div
              className="flex-1 flex items-center justify-center p-6 min-h-0"
              onClick={(event) => {
                event.stopPropagation();
              }}
            >
              <div className="w-full h-full max-w-md max-h-[400px] flex items-center justify-center min-h-0">
                <Flashcard
                  front={{
                    html: (
                      <div
                        className="[container-type:size] p-8 flex items-center justify-center h-full min-h-0 w-full text-center font-medium overflow-y-auto"
                        style={{
                          color: resolvedTheme === "dark" ? "#f3f4f6" : "#111827",
                        }}
                      >
                        <div className="w-full min-w-0 text-left">
                          <StreamdownMarkdown className="text-[length:clamp(0.82rem,0.42rem+3cqmin,2.85rem)] leading-snug max-w-none [&_.streamdown-content]:!text-inherit [&_.streamdown-content]:![font-size:1em] [&_.streamdown-content_p]:!text-inherit">
                            {frontText}
                          </StreamdownMarkdown>
                        </div>
                      </div>
                    ),
                  }}
                  back={{
                    html: (
                      <div
                        className="[container-type:size] p-8 flex items-center justify-center h-full min-h-0 w-full text-center font-medium overflow-y-auto"
                        style={{
                          color: resolvedTheme === "dark" ? "#f3f4f6" : "#111827",
                        }}
                      >
                        <div className="w-full min-w-0 text-left">
                          <StreamdownMarkdown className="text-[length:clamp(0.82rem,0.42rem+3cqmin,2.85rem)] leading-snug max-w-none [&_.streamdown-content]:!text-inherit [&_.streamdown-content]:![font-size:1em] [&_.streamdown-content_p]:!text-inherit">
                            {backText}
                          </StreamdownMarkdown>
                        </div>
                      </div>
                    ),
                  }}
                />
              </div>
            </div>
          );
        })()}

      {item.type === "youtube" &&
        (() => {
          const youtubeData = item.data as YouTubeData;
          const hasValidUrl =
            extractYouTubeVideoId(youtubeData.url) !== null ||
            extractYouTubePlaylistId(youtubeData.url) !== null;

          if (!hasValidUrl) {
            return (
              <div className="p-0 min-h-0">
                <div className="flex flex-col items-center justify-center gap-3 text-center h-full p-4">
                  <div className="rounded-lg p-4 bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                    <span
                      className={cn(
                        "font-medium",
                        resolvedTheme === "dark"
                          ? "text-red-400"
                          : "text-red-600",
                      )}
                    >
                      Invalid YouTube URL
                    </span>
                  </div>
                  <p
                    className={cn(
                      "text-xs",
                      resolvedTheme === "dark"
                        ? "text-muted-foreground/70"
                        : "text-muted-foreground/50",
                    )}
                  >
                    Please check the URL and try again
                  </p>
                </div>
              </div>
            );
          }

          return <YouTubeCardContent item={item} />;
        })()}

      {item.type === "image" && <ImageCardContent item={item} />}

      {item.type === "audio" && shouldShowPreview && (
        <div className="flex-1 min-h-0 overflow-hidden">
          <AudioCardContent
            item={item}
            isCompact
            isScrollLocked={isScrollLocked}
          />
        </div>
      )}

      {item.type === "document" &&
        shouldShowPreview &&
        (documentAwaitingGeneration ? (
          <div className="flex-1 min-h-0 p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
              Generating document...
            </div>
            <Skeleton className="h-4 w-full bg-foreground/10" />
            <Skeleton className="h-4 w-3/4 bg-foreground/10" />
            <Skeleton className="h-4 w-5/6 bg-foreground/10" />
          </div>
        ) : (
          <div
            className="flex-1 min-h-0 px-3 pb-3 overflow-y-scroll"
            style={{
              pointerEvents: isScrollLocked ? "none" : "auto",
              scrollbarGutter: "stable",
            }}
          >
            <StreamdownMarkdown className="text-sm leading-6">
              {documentPreviewText}
            </StreamdownMarkdown>
          </div>
        ))}
    </>
  );
}
