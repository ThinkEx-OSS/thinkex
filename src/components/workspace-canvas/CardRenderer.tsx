"use client";

import type {
  Item,
  ItemData,
  PdfData,
  FlashcardData,
  YouTubeData,
  ImageData,
  DocumentData,
} from "@/lib/workspace-state/types";
import { DocumentEditor } from "@/components/editor/DocumentEditor";
import FlashcardContent from "./FlashcardContent";
import YouTubeCardContent from "./YouTubeCardContent";
import ImageCardContent from "./ImageCardContent";
import { AudioCardContent } from "./AudioCardContent";

import { QuizContent } from "./QuizContent";

export function CardRenderer(props: {
  item: Item;
  onUpdateData: (updater: (prev: ItemData) => ItemData) => void;
  layoutKey?: string | number;
  quizClassName?: string; // Optional padding/className for quiz when shown in modal
}) {
  const { item, onUpdateData, quizClassName } = props;

  if (item.type === "pdf") {
    const pdfData = item.data as PdfData;
    return (
      <div className="mt-4 p-4 rounded-lg bg-muted/30 text-center">
        <p className="text-sm text-muted-foreground">
          PDF: {pdfData.filename || "Document"}
        </p>
        <p className="text-xs text-muted-foreground/70 mt-2">
          Use the PDF viewer to read this document
        </p>
      </div>
    );
  }

  if (item.type === "flashcard") {
    return <FlashcardContent item={item} onUpdateData={onUpdateData} />;
  }

  if (item.type === "quiz") {
    return (
      <QuizContent
        item={item}
        onUpdateData={onUpdateData}
        className={quizClassName}
      />
    );
  }

  if (item.type === "youtube") {
    return <YouTubeCardContent item={item} />;
  }

  if (item.type === "image") {
    return <ImageCardContent item={item} />;
  }

  if (item.type === "audio") {
    return <AudioCardContent item={item} />;
  }

  if (item.type === "website") {
    // Website cards are rendered via WebsitePanelContent in the panel;
    // this fallback is for generic/modal context
    const websiteData =
      item.data as import("@/lib/workspace-state/types").WebsiteData;
    let hostname = "";
    try {
      hostname = new URL(websiteData.url).hostname.replace(/^www\./, "");
    } catch {}
    return (
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-3 p-8">
        {websiteData.favicon ? (
          <img
            src={websiteData.favicon}
            alt=""
            className="size-16 rounded-lg"
          />
        ) : (
          <div className="size-16 rounded-lg bg-muted flex items-center justify-center">
            <span className="text-2xl font-bold text-muted-foreground">
              {hostname.charAt(0).toUpperCase()}
            </span>
          </div>
        )}
        {hostname && (
          <span className="text-sm text-muted-foreground">{hostname}</span>
        )}
      </div>
    );
  }

  if (item.type === "document") {
    const documentData = item.data as DocumentData;
    const md = documentData.markdown?.trim() || "";
    return (
      <div className="flex flex-col">
        <DocumentEditor
          autofocus={true}
          cardName={item.name}
          content={md || undefined}
          contentType={md ? "markdown" : undefined}
          embedded={true}
          showThemeToggle={false}
          onUpdate={({ markdown }) => {
            onUpdateData(() => ({
              markdown,
            }));
          }}
        />
      </div>
    );
  }

  return (
    <div className="mt-4 p-4 rounded-lg bg-muted/30 text-center">
      <p className="text-sm text-muted-foreground">
        Unknown card type: {item.type}
      </p>
    </div>
  );
}

export default CardRenderer;
