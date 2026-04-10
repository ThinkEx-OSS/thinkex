import { z } from "zod";
import type { CardType, ItemData } from "@/lib/workspace-state/types";
import type { WorkspaceItemCapability } from "./workspace-item-model-types";
import {
  pdfDataSchema,
  flashcardDataSchema,
  folderDataSchema,
  youtubeDataSchema,
  quizDataSchema,
  imageDataSchema,
  audioDataSchema,
  websiteDataSchema,
  documentDataSchema,
} from "@/lib/workspace-state/item-data-schemas";

export { quizSessionSchema } from "@/lib/workspace-state/item-data-schemas";

export const itemDataSchemas: Record<CardType, z.ZodType<ItemData>> = {
  pdf: pdfDataSchema as z.ZodType<ItemData>,
  flashcard: flashcardDataSchema as z.ZodType<ItemData>,
  folder: folderDataSchema as z.ZodType<ItemData>,
  youtube: youtubeDataSchema as z.ZodType<ItemData>,
  quiz: quizDataSchema as z.ZodType<ItemData>,
  image: imageDataSchema as z.ZodType<ItemData>,
  audio: audioDataSchema as z.ZodType<ItemData>,
  website: websiteDataSchema as z.ZodType<ItemData>,
  document: documentDataSchema as z.ZodType<ItemData>,
};

export const itemCapabilities: Record<CardType, WorkspaceItemCapability[]> = {
  pdf: ["asset_ref", "ocr_content"],
  flashcard: ["structured_content", "user_state"],
  folder: [],
  youtube: ["embed_ref", "user_state"],
  quiz: ["structured_content", "user_state"],
  image: ["asset_ref", "ocr_content"],
  audio: ["asset_ref", "structured_content", "transcript_content"],
  website: ["embed_ref"],
  document: ["text_content", "sources"],
};

export function emptyDataForType(type: CardType): ItemData {
  switch (type) {
    case "pdf":
      return { fileUrl: "", filename: "" };
    case "flashcard":
      return { cards: [] };
    case "folder":
      return {};
    case "youtube":
      return { url: "" };
    case "quiz":
      return { questions: [] };
    case "image":
      return { url: "" };
    case "audio":
      return { fileUrl: "", filename: "", processingStatus: "uploading" };
    case "website":
      return { url: "" };
    case "document":
      return { markdown: "" };
  }
}
