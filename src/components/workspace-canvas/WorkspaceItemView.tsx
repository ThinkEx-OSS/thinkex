"use client";

import { useState } from "react";
import type {
  Item,
  ItemData,
  PdfData,
  YouTubeData,
  ImageData,
  DocumentData,
} from "@/lib/workspace-state/types";
import { DocumentEditor } from "@/components/editor/DocumentEditor";
import LazyAppPdfViewer from "@/components/pdf/LazyAppPdfViewer";
import { PdfPanelHeader } from "@/components/pdf/PdfPanelHeader";
import LazyImageViewer from "@/components/image-viewer/LazyImageViewer";
import { ImagePanelHeader } from "@/components/image-viewer/ImagePanelHeader";
import FlashcardContent from "./FlashcardContent";
import { QuizContent } from "./QuizContent";
import { AudioCardContent } from "./AudioCardContent";
import { YouTubeCardContent } from "./YouTubeCardContent";
import { ImageCardContent } from "./ImageCardContent";
import { DocumentCardContent } from "./DocumentCardContent";
import { PdfCardContent } from "./PdfCardContent";
import { QuizCardContent } from "./QuizCardContent";
import { FlashcardCardContent } from "./FlashcardCardContent";
import { YouTubePanelContent } from "./YouTubePanelContent";
import {
  extractYouTubePlaylistId,
  extractYouTubeVideoId,
} from "@/lib/utils/youtube-url";

export function isFramelessWorkspaceCardItem(item: Item): boolean {
  return false;
}

export function usesManagedWorkspacePanelLayout(item: Item): boolean {
  if (item.type === "youtube" || item.type === "image") {
    return true;
  }

  if (item.type === "pdf") {
    return Boolean((item.data as PdfData).fileUrl);
  }

  return false;
}

export function WorkspaceCanvasItemPreview({
  item,
  onUpdateItem,
}: {
  item: Item;
  onUpdateItem?: (itemId: string, updates: Partial<Item>) => void;
}) {
  return (
    <>
      {item.type === "youtube" ? <CanvasYouTubePreview item={item} /> : null}

      {item.type === "image" ? <ImageCardContent item={item} /> : null}

      {item.type === "document" ? <DocumentCardContent item={item} /> : null}

      {item.type === "pdf" ? (
        <PdfCardContent item={item} onUpdateItem={onUpdateItem} />
      ) : null}

      {item.type === "audio" ? <AudioCardContent item={item} isCompact /> : null}

      {item.type === "quiz" ? <QuizCardContent item={item} /> : null}

      {item.type === "flashcard" ? <FlashcardCardContent item={item} /> : null}
    </>
  );
}

function CanvasYouTubePreview({ item }: { item: Item }) {
  const youtubeData = item.data as YouTubeData;
  const hasValidUrl =
    extractYouTubeVideoId(youtubeData.url) !== null ||
    extractYouTubePlaylistId(youtubeData.url) !== null;

  if (!hasValidUrl) {
    return (
      <div className="p-0 min-h-0">
        <div className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center">
          <div className="flex items-center justify-center rounded-lg border border-red-500/20 bg-red-500/10 p-4">
            <span className="font-medium text-red-600 dark:text-red-400">
              Invalid YouTube URL
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Please check the URL and try again
          </p>
        </div>
      </div>
    );
  }

  return <YouTubeCardContent item={item} />;
}

interface WorkspacePanelItemPreviewProps {
  item: Item;
  onClose: () => void;
  onMaximize: () => void;
  onUpdateData: (updater: (prev: ItemData) => ItemData) => void;
  citationHighlightQuery: {
    itemId: string;
    query: string;
    pageNumber?: number;
  } | null;
}

export function WorkspacePanelItemPreview({
  item,
  onClose,
  onMaximize,
  onUpdateData,
  citationHighlightQuery,
}: WorkspacePanelItemPreviewProps) {
  const [showThumbnails, setShowThumbnails] = useState(false);

  if (item.type === "pdf") {
    const pdfData = item.data as PdfData;

    if (!pdfData.fileUrl) {
      return (
        <div className="mt-4 rounded-lg bg-muted/30 p-4 text-center">
          <p className="text-sm text-muted-foreground">
            PDF: {pdfData.filename || "Document"}
          </p>
          <p className="mt-2 text-xs text-muted-foreground/70">
            Use the PDF viewer to read this document
          </p>
        </div>
      );
    }

    return (
      <div className="flex w-full flex-1 min-h-0 flex-col">
        <LazyAppPdfViewer
          pdfSrc={pdfData.fileUrl}
          showThumbnails={showThumbnails}
          itemName={item.name}
          itemId={item.id}
          initialPage={
            citationHighlightQuery?.itemId === item.id &&
            citationHighlightQuery?.pageNumber != null &&
            citationHighlightQuery.pageNumber >= 1 &&
            !citationHighlightQuery?.query?.trim()
              ? citationHighlightQuery.pageNumber
              : undefined
          }
          isMaximized={true}
          renderHeader={(documentId) => (
            <div>
              <PdfPanelHeader
                documentId={documentId}
                itemName={item.name}
                isMaximized={true}
                onClose={onClose}
                onMaximize={onMaximize}
                showThumbnails={showThumbnails}
                onToggleThumbnails={() =>
                  setShowThumbnails((current) => !current)
                }
                renderInPortal={true}
              />
            </div>
          )}
        />
      </div>
    );
  }

  if (item.type === "youtube") {
    return <YouTubePanelContent item={item} onUpdateItemData={onUpdateData} />;
  }

  if (item.type === "image") {
    const imageData = item.data as ImageData;

    return (
      <div className="flex w-full flex-1 min-h-0 flex-col">
        <LazyImageViewer
          src={imageData.url}
          alt={imageData.altText || item.name}
          itemName={item.name}
          itemId={item.id}
          isMaximized={true}
          renderHeader={(controls) => (
            <ImagePanelHeader
              itemName={item.name}
              isMaximized={true}
              onClose={onClose}
              onMaximize={onMaximize}
              controls={controls}
              renderInPortal={true}
              imageSrc={imageData.url}
            />
          )}
        />
      </div>
    );
  }

  if (item.type === "flashcard") {
    return <FlashcardContent item={item} />;
  }

  if (item.type === "quiz") {
    return (
      <QuizContent
        item={item}
        onUpdateData={onUpdateData}
        className="p-4 md:p-5 lg:p-6"
      />
    );
  }

  if (item.type === "audio") {
    return <AudioCardContent item={item} />;
  }

  if (item.type === "document") {
    const documentData = item.data as DocumentData;
    const markdown = documentData.markdown ?? "";

    return (
      <div className="flex flex-col">
        <DocumentEditor
          autofocus={true}
          cardName={item.name}
          content={markdown || undefined}
          contentType={markdown ? "markdown" : undefined}
          embedded={true}
          showThemeToggle={false}
          onUpdate={({ markdown: nextMarkdown }) => {
            onUpdateData(() => ({
              markdown: nextMarkdown,
            }));
          }}
        />
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-lg bg-muted/30 p-4 text-center">
      <p className="text-sm text-muted-foreground">
        Unknown card type: {item.type}
      </p>
    </div>
  );
}
