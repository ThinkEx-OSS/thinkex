"use client";

import { Flashcard } from "react-quizlet-flashcard";
import "react-quizlet-flashcard/dist/index.css";
import { cn } from "@/lib/utils";
import type {
  Item,
  FlashcardData,
  YouTubeData,
} from "@/lib/workspace-state/types";
import ItemHeader from "@/components/workspace-canvas/ItemHeader";
import { StreamdownMarkdown } from "@/components/ui/streamdown-markdown";
import {
  extractYouTubePlaylistId,
  extractYouTubeVideoId,
} from "@/lib/utils/youtube-url";
import { YouTubeCardContent } from "./YouTubeCardContent";
import { ImageCardContent } from "./ImageCardContent";

interface WorkspaceCardContentProps {
  item: Item;
  resolvedTheme?: string;
  onNameChange: (value: string) => void;
  onNameCommit: (value: string) => void;
  onSubtitleChange: (value: string) => void;
  onTitleFocus: () => void;
  onTitleBlur: () => void;
}

export function WorkspaceCardContent({
  item,
  resolvedTheme,
  onNameChange,
  onNameCommit,
  onSubtitleChange,
  onTitleFocus,
  onTitleBlur,
}: WorkspaceCardContentProps) {
  const isCompactTextCard =
    item.type === "pdf" ||
    item.type === "quiz" ||
    item.type === "audio" ||
    item.type === "document";
  const shouldShowHeader = item.type !== "youtube" && item.type !== "image";

  return (
    <>
      {shouldShowHeader && (
        <div
          className={
            isCompactTextCard ? "flex-1 flex flex-col min-h-0" : "flex-shrink-0"
          }
        >
          <div className="relative z-10 h-full">
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
          </div>
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
                          color:
                            resolvedTheme === "dark" ? "#f3f4f6" : "#111827",
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
                          color:
                            resolvedTheme === "dark" ? "#f3f4f6" : "#111827",
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
    </>
  );
}
