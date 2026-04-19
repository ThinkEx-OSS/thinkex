import { getOcrPagesTextContent } from "@/lib/utils/ocr-pages";
import type {
  AudioData,
  AudioSegment,
  CardType,
  DocumentData,
  FlashcardData,
  FlashcardItem,
  ImageData,
  Item,
  PdfData,
  QuizData,
  QuizQuestion,
  WebsiteData,
  YouTubeData,
} from "@/lib/workspace-state/types";
import { itemCapabilities } from "./workspace-item-model-schemas";
import type { WorkspaceItemCapability } from "./workspace-item-model-types";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJson);
  }

  if (!isRecord(value)) {
    return value;
  }

  return Object.keys(value)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = sortJson(value[key]);
      return acc;
    }, {});
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

export function hashString(input: string): string {
  let hash = 2166136261;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

function truncateContent(text: string, limit = 280): string | null {
  const normalized = text.replace(/\s+/g, " ").trim();

  if (!normalized) {
    return null;
  }

  if (normalized.length <= limit) {
    return normalized;
  }

  return `${normalized.slice(0, limit - 1)}…`;
}

function formatFlashcards(cards: FlashcardItem[]): string {
  return cards.map((card) => `${card.front}\n${card.back}`).join("\n\n");
}

function formatQuizQuestions(
  questions: QuizQuestion[],
  title?: string,
): string {
  const questionText = questions
    .map((question) =>
      [
        question.question ?? question.questionText ?? "",
        question.options.join("\n"),
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n");

  return [title ?? "", questionText].filter(Boolean).join("\n\n");
}

function formatAudioSearchText(
  summary: string | undefined,
  transcript: string | undefined,
  segments: AudioSegment[] | undefined,
): string {
  const parts: string[] = [];

  if (summary?.trim()) {
    parts.push(summary.trim());
  }

  if (transcript?.trim()) {
    parts.push(transcript.trim());
  }

  if (segments?.length) {
    parts.push(
      segments
        .map((segment) =>
          [segment.speaker, segment.content, segment.translation]
            .filter(Boolean)
            .join(": "),
        )
        .join("\n"),
    );
  }

  return parts.join("\n\n");
}

function getDomain(url: string | undefined): string {
  if (!url) {
    return "";
  }

  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function nullIfEmptyString(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function getItemSearchBody(item: Item): string {
  switch (item.type) {
    case "document":
      return ((item.data as DocumentData).markdown ?? "").trim();
    case "pdf":
      return getOcrPagesTextContent((item.data as PdfData).ocrPages).trim();
    case "image":
      return getOcrPagesTextContent((item.data as ImageData).ocrPages).trim();
    case "flashcard":
      return formatFlashcards((item.data as FlashcardData).cards ?? []);
    case "quiz": {
      const data = item.data as QuizData;
      return formatQuizQuestions(data.questions ?? [], data.title);
    }
    case "audio": {
      const data = item.data as AudioData;
      return formatAudioSearchText(
        data.summary,
        data.transcript,
        data.segments,
      );
    }
    case "website": {
      const data = item.data as WebsiteData;
      const domain = getDomain(data.url);
      return [data.url, domain].filter(Boolean).join("\n");
    }
    case "youtube": {
      const data = item.data as YouTubeData;
      return [data.url, data.thumbnail ?? ""].filter(Boolean).join("\n");
    }
    case "folder":
      return "";
  }
}

export function getItemSearchIndex(item: Item): string {
  return [item.name, item.subtitle, item.type, getItemSearchBody(item)]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
}

export function getItemContentPreview(item: Item): string | null {
  return truncateContent(getItemSearchBody(item));
}

export function getWorkspaceItemCapabilities(
  type: CardType,
): WorkspaceItemCapability[] {
  return itemCapabilities[type] ?? [];
}
