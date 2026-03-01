import { NextRequest } from "next/server";
import { google } from "@ai-sdk/google";
import { streamText, generateText, Output } from "ai";
import { z } from "zod";
import { executeWebSearch } from "@/lib/ai/tools/web-search";
import { randomUUID } from "crypto";
import { desc, eq, sql } from "drizzle-orm";
import { requireAuthWithUserInfo } from "@/lib/api/workspace-helpers";
import { db, workspaces } from "@/lib/db/client";
import { generateSlug } from "@/lib/workspace/slug";
import { workspaceWorker, quizWorker, type CreateItemParams } from "@/lib/ai/workers";
import { searchVideos } from "@/lib/youtube";
import { UrlProcessor } from "@/lib/ai/utils/url-processor";
import { findNextAvailablePosition } from "@/lib/workspace-state/grid-layout-helpers";
import type { Item } from "@/lib/workspace-state/types";
import { CANVAS_CARD_COLORS } from "@/lib/workspace-state/colors";
import { logger } from "@/lib/utils/logger";

const MAX_TITLE_LENGTH = 60;
const LOG_TRUNCATE = 400;

function truncateForLog(s: string, max = LOG_TRUNCATE): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + "...";
}

// HeroIcons that make sense as workspace topics (study, projects, subjects). No UI/settings/redundant.
const AVAILABLE_ICONS = [
  "AcademicCapIcon", "ArchiveBoxIcon", "AtSymbolIcon", "BanknotesIcon", "BeakerIcon", "BellIcon", "BoltIcon",
  "BookOpenIcon", "BookmarkIcon", "BriefcaseIcon", "BugAntIcon", "BuildingLibraryIcon", "BuildingOfficeIcon", "BuildingStorefrontIcon",
  "CakeIcon", "CalculatorIcon", "CalendarDaysIcon", "CalendarIcon", "CameraIcon", "ChartBarIcon", "ChartPieIcon",
  "ChatBubbleLeftIcon", "CircleStackIcon", "ClipboardDocumentIcon", "ClockIcon", "CloudIcon", "CodeBracketIcon",
  "CommandLineIcon", "ComputerDesktopIcon", "CpuChipIcon", "CreditCardIcon", "CubeIcon",
  "CurrencyDollarIcon", "CurrencyEuroIcon", "CurrencyPoundIcon", "CurrencyYenIcon",
  "DocumentIcon", "DocumentTextIcon", "EnvelopeIcon", "FilmIcon", "FireIcon", "FlagIcon", "FolderIcon", "FolderOpenIcon",
  "GiftIcon", "GlobeAltIcon", "GlobeAmericasIcon", "GlobeAsiaAustraliaIcon", "GlobeEuropeAfricaIcon", "HashtagIcon", "HeartIcon",
  "HomeIcon", "InboxIcon", "LanguageIcon", "LightBulbIcon", "LinkIcon", "MapIcon", "MapPinIcon", "MegaphoneIcon",
  "MicrophoneIcon", "MusicalNoteIcon", "NewspaperIcon", "PaintBrushIcon", "PaperAirplaneIcon", "PencilIcon", "PhotoIcon",
  "PlayCircleIcon", "PlayIcon", "PresentationChartLineIcon", "PuzzlePieceIcon", "QuestionMarkCircleIcon", "RadioIcon",
  "RectangleStackIcon", "RocketLaunchIcon", "RssIcon", "ScaleIcon", "ServerIcon", "ShareIcon",
  "ShoppingBagIcon", "ShoppingCartIcon", "SparklesIcon", "SpeakerWaveIcon", "Square2StackIcon", "Squares2X2Icon",
  "StarIcon", "TableCellsIcon", "TagIcon", "TrophyIcon", "TvIcon", "UserGroupIcon", "UsersIcon", "VideoCameraIcon", "ViewColumnsIcon",
  "WrenchIcon",
];

/** Layout positions for autogen items (matches desired workspace arrangement) */
const AUTOGEN_LAYOUTS = {
  youtube: { x: 0, y: 0, w: 2, h: 2 },
  flashcard: { x: 2, y: 0, w: 2, h: 1 },
  note: { x: 2, y: 1, w: 1, h: 1 },
  quiz: { x: 0, y: 2, w: 2, h: 3 },
  pdf: { w: 1, h: 1 },
  image: { w: 2, h: 2 },
} as const;

type FileUrlItem = { url: string; mediaType: string; filename?: string; fileSize?: number };

type UserMessagePart =
  | { type: "text"; text: string }
  | { type: "image"; image: string; mediaType?: string }
  | { type: "file"; data: string; mediaType: string; filename?: string };

function isYouTubeUrl(url: string): boolean {
  return /youtube\.com\/watch|youtu\.be\//.test(url);
}

function buildUserMessage(
  prompt: string,
  fileUrls?: FileUrlItem[],
  links?: string[]
): { role: "user"; content: UserMessagePart[] } {
  const parts: UserMessagePart[] = [];
  const textParts: string[] = [prompt];
  const nonYtLinks = links?.filter((l) => !isYouTubeUrl(l)) ?? [];
  if (nonYtLinks.length) {
    textParts.push("\n\nReferences: " + nonYtLinks.join(", "));
  }
  parts.push({ type: "text", text: textParts.join("") });
  for (const f of fileUrls ?? []) {
    const isImage = f.mediaType.startsWith("image/");
    if (isImage) {
      parts.push({ type: "image", image: f.url, mediaType: f.mediaType });
    } else {
      parts.push({
        type: "file",
        data: f.url,
        mediaType: f.mediaType,
        ...(f.filename && { filename: f.filename }),
      });
    }
  }
  const ytUrl = links?.find(isYouTubeUrl);
  if (ytUrl) {
    parts.push({ type: "file", data: ytUrl, mediaType: "video/mp4" });
  }
  return { role: "user", content: parts };
}

const ALLOWED_URL_HOSTS = (() => {
  const hosts = ["supabase.co", "supabase.in"];
  try {
    const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (typeof envUrl === "string" && envUrl) {
      hosts.push(new URL(envUrl).hostname);
    }
  } catch {
    /* ignore */
  }
  return hosts;
})();

function isAllowedFileUrl(url: string | undefined): boolean {
  if (!url || typeof url !== "string") return false;
  try {
    const u = new URL(url);
    return ALLOWED_URL_HOSTS.some(
      (h) => u.hostname === h || u.hostname.endsWith(`.${h}`)
    );
  } catch {
    return false;
  }
}

/** Schema for main agent distillation when user has attachments */
const DISTILLED_SCHEMA = z.object({
  metadata: z.object({
    title: z.string().describe("A short, concise workspace title (max 5-6 words)"),
    icon: z.string().describe("A HeroIcon name that represents the topic"),
    color: z.string().describe("A hex color code that fits the topic theme"),
  }),
  contentSummary: z
    .string()
    .describe("Comprehensive summary of the content for creating study note and flashcards. Include key concepts, facts, and structure. 200-800 words."),
  quizTopic: z.string().describe("Topic string for quiz generation, with references if relevant"),
  youtubeSearchTerm: z.string().describe("Broad, general search query for finding a related YouTube video (e.g. 'Emacs tutorial for beginners' not 'CMSC 216 UNIX Emacs project grading')."),
});

type DistilledOutput = z.infer<typeof DISTILLED_SCHEMA>;

type DistillationResult = {
  metadata: { title: string; icon: string; color: string };
  contentSummary: string;
  quizTopic: string;
  youtubeSearchTerm: string;
  sources: Array<{ title: string; url: string }>;
};

const SEARCH_DECISION_SCHEMA = z.object({
  needsSearch: z.boolean().describe("True if the prompt references current events, recent news, specific people/companies, unfamiliar topics, or anything that would benefit from up-to-date web information"),
  searchQuery: z.string().optional().describe("If needsSearch is true, a concise 2-6 word search query to find relevant information (e.g. 'Fed interest rate 2025' or 'company name latest news')"),
});

/** Phase 1: Flash-lite decides whether to search. Returns search context + sources if needed. */
async function runSearchPhase(
  prompt: string,
  hasAttachments: boolean,
  send: (ev: StreamEvent) => void
): Promise<{ searchContext: string; sources: Array<{ title: string; url: string }> }> {
  const { output } = await generateText({
    model: google("gemini-2.5-flash-lite"),
    output: Output.object({ schema: SEARCH_DECISION_SCHEMA }),
    prompt: `Given this user prompt for a study workspace, decide if web search would help.

User prompt: "${prompt.slice(0, 500)}"
Has attachments (files/links): ${hasAttachments}

Set needsSearch=true only if: current events, recent news, specific people/places/companies, or topics you're uncertain about.
Set needsSearch=false for: general concepts, textbook topics, well-known subjects, or when the user provided sufficient context.
If needsSearch=true, provide a searchQuery (2-6 words) to look up.`,
  });

  if (!output || !output.needsSearch || !output.searchQuery?.trim()) {
    return { searchContext: "", sources: [] };
  }

  const query = String(output.searchQuery).trim();
  send({ type: "toolCall", data: { toolName: "webSearch", query, status: "searching" } });
  const { text, sources } = await executeWebSearch(query);
  send({ type: "toolResult", data: { toolName: "webSearch", status: "done" } });

  const searchContext = `\n\nCONTEXT FROM WEB SEARCH (use this to inform your response):\n${text}`;
  return { searchContext, sources };
}

const MAX_LINK_CONTENT_CHARS = 6000;

/** Main agent: reads full message (PDFs, video, links) once, outputs metadata + distilled prompts. No tools—uses pre-fetched search context and link content when available. */
async function runDistillationAgent(
  prompt: string,
  fileUrls: FileUrlItem[],
  links: string[],
  searchContext: string,
  sources: Array<{ title: string; url: string }>,
  send: (ev: StreamEvent) => void
): Promise<DistillationResult> {
  let output: DistilledOutput | undefined;

  const nonYtLinks = links?.filter((l) => !isYouTubeUrl(l)) ?? [];
  let linkContext = "";
  if (nonYtLinks.length > 0) {
    send({ type: "toolCall", data: { toolName: "urlFetch", status: "fetching" } });
    const results = await UrlProcessor.processUrls(nonYtLinks);
    const successful = results.filter((r) => r.success && r.content);
    if (successful.length > 0) {
      linkContext =
        "\n\nCONTEXT FROM REFERENCE LINKS (use this to inform your response):\n" +
        successful
          .map((r) => {
            const content = r.content!.length > MAX_LINK_CONTENT_CHARS ? r.content!.slice(0, MAX_LINK_CONTENT_CHARS) + "..." : r.content!;
            return `**${r.title}** (${r.url})\n\n${content}`;
          })
          .join("\n\n---\n\n");
    }
    send({ type: "toolResult", data: { toolName: "urlFetch", status: "done" } });
  }

  const userMessage = buildUserMessage(prompt, fileUrls, links);
  const contextParts: string[] = [searchContext, linkContext].filter(Boolean);
  const combinedContext = contextParts.length > 0 ? contextParts.join("") : "";
  const contentWithContext: UserMessagePart[] = combinedContext
    ? userMessage.content.map((part): UserMessagePart =>
      part.type === "text" ? { type: "text", text: combinedContext + (part.text ?? "") } : part
    )
    : userMessage.content;

  const { partialOutputStream } = streamText({
    model: google("gemini-2.5-flash-lite"),
    output: Output.object({ schema: DISTILLED_SCHEMA }),
    system: `<role>
You are a workspace content distiller. The user provides content (prompt, files, links). You extract metadata and distilled content for creating study materials.
</role>

<task>
1. Generate workspace metadata: a short title (5-6 words), an icon from the list, and a hex color.
2. Write a content summary (200-800 words) with key concepts, facts, and structure for notes and flashcards.
3. Produce a quiz topic string focused EXPLICITLY on the introductory / foundational concepts covered at the very beginning of the content (optionally "References: ..." if links are relevant). Do NOT use advanced concepts from the middle or end.
4. Produce a YouTube search term: broad, 2-5 common words (e.g. "Emacs tutorial beginners"). Do NOT use course codes, assignment names, or narrow phrasing.
</task>

<constraints>
- If CONTEXT FROM WEB SEARCH or CONTEXT FROM REFERENCE LINKS is provided below, ground your response in it.
- Icons must be one of: ${AVAILABLE_ICONS.join(", ")}
</constraints>

<example>
Input: "Create a workspace for learning Python data analysis"
Output shape: metadata (title: "Python Data Analysis", icon: "ChartBarIcon", color: "#3b82f6"), contentSummary (structured overview of key topics), quizTopic ("Python pandas matplotlib"), youtubeSearchTerm ("Python data analysis tutorial")
</example>`,
    messages: [{ role: "user" as const, content: contentWithContext }] as const,
    onError: ({ error }) => logger.error("[AUTOGEN] Distillation stream error:", error),
  });

  for await (const partial of partialOutputStream) {
    output = partial as DistilledOutput;
    send({ type: "partial", data: { stage: "distillation", partial } });
  }

  if (!output) throw new Error("Failed to generate distillation output");

  const meta = output.metadata ?? {};
  let title = String(meta.title ?? "").trim();
  if (title.length > MAX_TITLE_LENGTH) title = title.substring(0, MAX_TITLE_LENGTH).trim();
  if (!title) title = "New Workspace";

  let icon = meta.icon;
  if (!icon || !AVAILABLE_ICONS.includes(icon)) icon = "FolderIcon";

  let color = meta.color;
  if (!/^#[0-9A-Fa-f]{6}$/.test(color)) {
    color = CANVAS_CARD_COLORS[Math.floor(Math.random() * CANVAS_CARD_COLORS.length)];
  }

  const contentSummary = String(output.contentSummary ?? "").trim() || prompt;
  const quizTopic = String(output.quizTopic ?? "").trim() || prompt;
  const youtubeSearchTerm = String(output.youtubeSearchTerm ?? "").trim() || prompt;

  const result: DistillationResult = {
    metadata: { title, icon, color },
    contentSummary,
    quizTopic,
    youtubeSearchTerm,
    sources: Array.isArray(sources) ? sources : [],
  };
  logger.debug("[AUTOGEN] Distillation input", {
    prompt: truncateForLog(prompt),
    fileCount: fileUrls.length,
    linkCount: links.length,
    fileNames: fileUrls.map((f) => f.filename ?? f.url?.slice(-30)),
  });
  logger.debug("[AUTOGEN] Distillation output", {
    title: result.metadata.title,
    icon: result.metadata.icon,
    color: result.metadata.color,
    contentSummaryLength: result.contentSummary.length,
    contentSummaryPreview: truncateForLog(result.contentSummary),
    quizTopic: truncateForLog(result.quizTopic),
    youtubeSearchTerm: result.youtubeSearchTerm,
    sourcesCount: result.sources.length,
  });
  return result;
}

/** System prompt for note + flashcard generation. Aligns with formatWorkspaceContext FORMATTING (markdown, math, mermaid). */
const NOTE_FLASHCARD_SYSTEM = `You generate a study note and a flashcard deck for ThinkEx. Both must be on the same topic and use consistent formatting.

FORMATTING (apply to both note content and flashcard front/back text):
- Use Markdown (GFM): headers, lists, bold/italic, code, links.
- MATH: Use $$...$$ for all math (inline and block). Inline: $$E = mc^2$$ on the same line as text. Block: put $$...$$ on its own lines for centered display, e.g.
  $$
  \\int_{-\\infty}^{\\infty} e^{-x^2} \\, dx = \\sqrt{\\pi}
  $$
  For currency use a single $ with no closing $ (e.g. $19.99).

Output a complete note (title + markdown content) and 5–8 flashcard pairs (front, back) that reinforce the same material.`;

type StreamEvent =
  | { type: "phase"; data: { stage: "understanding" } }
  | { type: "metadata"; data: { title: string; icon: string; color: string } }
  | { type: "partial"; data: { stage: "metadata" | "distillation" | "noteFlashcards"; partial: unknown } }
  | { type: "toolCall"; data: { toolName: string; query?: string; status: string } }
  | { type: "toolResult"; data: { toolName: string; status: string } }
  | { type: "workspace"; data: { id: string; slug: string; name: string } }
  | { type: "progress"; data: { step: "understanding" | "note" | "quiz" | "flashcards" | "youtube"; status: "done" } }
  | { type: "complete"; data: { workspace: { id: string; slug: string; name: string } } }
  | { type: "error"; data: { message: string } };

function streamEvent(ev: StreamEvent): string {
  return JSON.stringify(ev) + "\n";
}

/**
 * POST /api/workspaces/autogen
 * Create a workspace with AI-generated content. Streams progress events.
 */
export async function POST(request: NextRequest) {
  // Auth before streaming (throws NextResponse on 401)
  let user;
  try {
    user = await requireAuthWithUserInfo();
  } catch (e) {
    return e as Response;
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (ev: StreamEvent) => {
        controller.enqueue(encoder.encode(streamEvent(ev)));
      };

      const autogenStart = Date.now();
      const timings: Record<string, number> = {};

      try {
        const userId = user!.userId;

        let body: { prompt?: string; fileUrls?: FileUrlItem[]; links?: string[] };
        try {
          body = await request.json();
        } catch {
          logger.error("[AUTOGEN] Invalid JSON payload");
          send({ type: "error", data: { message: "Invalid JSON payload" } });
          controller.close();
          return;
        }

        const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
        if (!prompt) {
          logger.warn("[AUTOGEN] Rejected: missing prompt");
          send({ type: "error", data: { message: "prompt is required" } });
          controller.close();
          return;
        }

        const fileUrls = Array.isArray(body?.fileUrls) ? body.fileUrls : undefined;
        const links = Array.isArray(body?.links) ? body.links : undefined;

        // Validate file URLs to prevent SSRF
        if (fileUrls?.length) {
          const invalid = fileUrls.filter((f) => !f?.url || !isAllowedFileUrl(f.url));
          if (invalid.length > 0) {
            logger.warn("[AUTOGEN] Rejected: invalid file URLs", { invalidCount: invalid.length });
            send({ type: "error", data: { message: "One or more file URLs are not allowed" } });
            controller.close();
            return;
          }
        }

        const hasParts = (fileUrls?.length ?? 0) > 0 || (links?.length ?? 0) > 0;
        logger.info("[AUTOGEN] Start", {
          userId,
          hasParts,
          fileCount: fileUrls?.length ?? 0,
          linkCount: links?.length ?? 0,
          promptLength: prompt.length,
        });

        // 1. Search phase: flash-lite decides if we need web search, runs it if yes
        send({ type: "phase", data: { stage: "understanding" } });
        const phase1Start = Date.now();
        const { searchContext, sources: searchSources } = await runSearchPhase(
          prompt,
          hasParts,
          send
        );

        // Mark "understanding" (and any search) phase complete so progress bar advances
        send({ type: "progress", data: { step: "understanding", status: "done" } });

        // 2. Distillation agent (streaming, no tools—avoids Gemini 2.5 tools+JSON limitation)
        const distilled = await runDistillationAgent(
          prompt,
          fileUrls ?? [],
          links ?? [],
          searchContext,
          searchSources,
          send
        );

        const { metadata, contentSummary, quizTopic, youtubeSearchTerm } = distilled;
        const { title, icon, color } = metadata;

        logger.debug("[AUTOGEN] Content-generation prompts", {
          contentSummaryLength: contentSummary?.length ?? 0,
          contentSummaryPreview: truncateForLog(contentSummary ?? ""),
          quizTopic: truncateForLog(quizTopic ?? ""),
          youtubeSearchTerm: youtubeSearchTerm ?? "",
        });

        timings.metadataMs = Date.now() - phase1Start;
        logger.info("[AUTOGEN] Distillation done", { ms: timings.metadataMs, title, sourcesCount: distilled.sources?.length ?? 0 });

        send({ type: "metadata", data: { title, icon, color } });

        // 2. Create workspace
        const phase2Start = Date.now();
        const maxSortData = await db
          .select({ sortOrder: workspaces.sortOrder })
          .from(workspaces)
          .where(eq(workspaces.userId, userId))
          .orderBy(desc(workspaces.sortOrder))
          .limit(1);

        const newSortOrder = (maxSortData[0]?.sortOrder ?? -1) + 1;

        let workspace;
        let attempts = 0;
        const MAX_ATTEMPTS = 5;

        while (attempts < MAX_ATTEMPTS) {
          try {
            const slug = generateSlug(title);
            [workspace] = await db
              .insert(workspaces)
              .values({
                userId,
                name: title,
                description: "",
                template: "blank",
                isPublic: false,
                icon,
                color,
                sortOrder: newSortOrder,
                slug,
              })
              .returning();
            break;
          } catch (error: unknown) {
            const err = error as { code?: string };
            if (err?.code === "23505") {
              attempts++;
              if (attempts >= MAX_ATTEMPTS) throw error;
              continue;
            }
            throw error;
          }
        }

        if (!workspace) {
          logger.error("[AUTOGEN] Failed to create workspace after insert");
          send({ type: "error", data: { message: "Failed to create workspace" } });
          controller.close();
          return;
        }

        timings.workspaceCreateMs = Date.now() - phase2Start;
        logger.info("[AUTOGEN] Workspace created", { ms: timings.workspaceCreateMs, workspaceId: workspace.id, slug: workspace.slug });

        const workspaceId = workspace.id;
        send({ type: "workspace", data: { id: workspace.id, slug: workspace.slug || "", name: workspace.name } });

        // Create WORKSPACE_CREATED event
        try {
          await db.execute(sql`
            SELECT append_workspace_event(
              ${workspaceId}::uuid,
              ${randomUUID()}::text,
              ${"WORKSPACE_CREATED"}::text,
              ${JSON.stringify({ title, description: "" })}::jsonb,
              ${Date.now()}::bigint,
              ${userId}::text,
              0::integer,
              ${user.name || user.email || null}::text
            )
          `);
        } catch (eventError) {
          logger.error("[AUTOGEN] Error creating WORKSPACE_CREATED event:", eventError);
        }

        // 3. Generate content in parallel. Stream progress as each completes. Defer DB writes to bulk create.
        const phase3Start = Date.now();
        const NOTE_FLASHCARD_SCHEMA = z.object({
          note: z.object({ title: z.string(), content: z.string() }),
          flashcards: z.object({
            title: z.string(),
            cards: z.array(z.object({ front: z.string(), back: z.string() })).min(5).max(12),
          }),
        });

        const noteAndFlashcardFn = async () => {
          type NoteFlashcardOutput = z.infer<typeof NOTE_FLASHCARD_SCHEMA>;
          let output: NoteFlashcardOutput | undefined;
          const { partialOutputStream } = streamText({
            model: google("gemini-2.5-flash"),
            system: NOTE_FLASHCARD_SYSTEM,
            output: Output.object({
              name: "NoteAndFlashcards",
              description: "Study note and flashcard deck for the same topic",
              schema: NOTE_FLASHCARD_SCHEMA,
            }),
            prompt: `Create study materials about the following content:

${contentSummary}

Return:
1. note: a short title and markdown content for a study note.
2. flashcards: a title and 5-8 flashcard pairs (front, back) on the same topic.`,
            onError: ({ error }) => logger.error("[AUTOGEN] NoteFlashcards stream error:", error),
          });

          for await (const partial of partialOutputStream) {
            output = partial as NoteFlashcardOutput;
            send({ type: "partial", data: { stage: "noteFlashcards", partial } });
          }

          if (!output?.note || !output?.flashcards) throw new Error("Failed to generate note and flashcards");

          send({ type: "progress", data: { step: "note", status: "done" } });
          send({ type: "progress", data: { step: "flashcards", status: "done" } });
          return {
            note: { title: output.note.title, content: output.note.content, layout: AUTOGEN_LAYOUTS.note },
            flashcards: { title: output.flashcards.title, cards: output.flashcards.cards, layout: AUTOGEN_LAYOUTS.flashcard },
          };
        };

        const youtubeUrlFromLinks = links?.find(isYouTubeUrl);

        const [noteFlashcardResult, quizResult, youtubeResult] = await Promise.all([
          noteAndFlashcardFn(),
          (async () => {
            const quiz = await quizWorker({ topic: quizTopic, questionCount: 5 });
            send({ type: "progress", data: { step: "quiz", status: "done" } });
            return { title: quiz.title, questions: quiz.questions, layout: AUTOGEN_LAYOUTS.quiz };
          })(),
          (async () => {
            if (youtubeUrlFromLinks) {
              send({ type: "progress", data: { step: "youtube", status: "done" } });
              return { title: "YouTube Video", url: youtubeUrlFromLinks, layout: AUTOGEN_LAYOUTS.youtube };
            }
            const videos = await searchVideos(youtubeSearchTerm, 3);
            const video = videos[0];
            if (!video) return null;
            send({ type: "progress", data: { step: "youtube", status: "done" } });
            return { title: video.title, url: video.url, layout: AUTOGEN_LAYOUTS.youtube };
          })(),
        ]);

        timings.contentGenerationMs = Date.now() - phase3Start;
        logger.info("[AUTOGEN] Content generation done", { ms: timings.contentGenerationMs });

        logger.debug("[AUTOGEN] Generated content", {
          note: {
            title: noteFlashcardResult.note.title,
            contentLength: noteFlashcardResult.note.content.length,
            contentPreview: truncateForLog(noteFlashcardResult.note.content),
          },
          flashcards: {
            title: noteFlashcardResult.flashcards.title,
            cardCount: noteFlashcardResult.flashcards.cards.length,
            firstCardFront: noteFlashcardResult.flashcards.cards[0]?.front
              ? truncateForLog(noteFlashcardResult.flashcards.cards[0].front, 120)
              : undefined,
          },
          quiz: {
            title: quizResult.title,
            questionCount: quizResult.questions.length,
          },
          youtube: youtubeResult
            ? { title: youtubeResult.title, url: youtubeResult.url?.slice(0, 50) + "..." }
            : null,
        });

        // Build create params for bulk create
        const phase4Start = Date.now();
        const createParams: CreateItemParams[] = [
          {
            title: noteFlashcardResult.note.title,
            content: noteFlashcardResult.note.content,
            itemType: "note",
            layout: noteFlashcardResult.note.layout,
            ...((distilled.sources?.length ?? 0) > 0 && { sources: distilled.sources }),
          },
          { title: noteFlashcardResult.flashcards.title, itemType: "flashcard", flashcardData: { cards: noteFlashcardResult.flashcards.cards }, layout: noteFlashcardResult.flashcards.layout },
          { title: quizResult.title, itemType: "quiz", quizData: { questions: quizResult.questions }, layout: quizResult.layout },
          ...(youtubeResult ? [{ title: youtubeResult.title, itemType: "youtube" as const, youtubeData: { url: youtubeResult.url }, layout: youtubeResult.layout }] : []),
        ];

        const pdfFileUrls = (fileUrls ?? []).filter((f) => f.mediaType === "application/pdf");
        const imageFileUrls = (fileUrls ?? []).filter((f) => f.mediaType?.startsWith("image/"));
        const itemsForLayout: Pick<Item, "type" | "layout">[] = [
          { type: "note", layout: noteFlashcardResult.note.layout },
          { type: "flashcard", layout: noteFlashcardResult.flashcards.layout },
          { type: "quiz", layout: quizResult.layout },
          ...(youtubeResult ? [{ type: "youtube" as const, layout: youtubeResult.layout }] : []),
        ];
        for (const pdf of pdfFileUrls) {
          const position = findNextAvailablePosition(itemsForLayout as Item[], "pdf", 4, "", "", AUTOGEN_LAYOUTS.pdf.w, AUTOGEN_LAYOUTS.pdf.h);
          const title = (pdf.filename ?? "document").replace(/\.pdf$/i, "");
          createParams.push({ title, itemType: "pdf", pdfData: { fileUrl: pdf.url, filename: pdf.filename ?? "document.pdf", fileSize: pdf.fileSize }, layout: position });
          itemsForLayout.push({ type: "pdf", layout: position });
        }
        for (const img of imageFileUrls) {
          const position = findNextAvailablePosition(itemsForLayout as Item[], "image", 4, "", "", AUTOGEN_LAYOUTS.image.w, AUTOGEN_LAYOUTS.image.h);
          const title = (img.filename ?? "image").replace(/\.(png|jpe?g|gif|webp|svg)$/i, "") || "Image";
          createParams.push({ title, itemType: "image", imageData: { url: img.url, altText: title }, layout: position });
          itemsForLayout.push({ type: "image", layout: position });
        }

        const bulkResult = await workspaceWorker("bulkCreate", { workspaceId, items: createParams });

        timings.bulkCreateMs = Date.now() - phase4Start;
        logger.info("[AUTOGEN] Bulk create done", { ms: timings.bulkCreateMs, itemCount: createParams.length });

        if (!(bulkResult as { success?: boolean }).success) {
          const errMsg =
            (bulkResult as { message?: string }).message ??
            "Failed to create workspace items";
          logger.error("[AUTOGEN] Bulk create failed", { errMsg, workspaceId });
          send({ type: "error", data: { message: errMsg } });
          return;
        }

        const totalMs = Date.now() - autogenStart;
        logger.info("[AUTOGEN] Complete", {
          totalMs,
          workspaceId: workspace.id,
          slug: workspace.slug,
          timings: { ...timings },
        });

        send({
          type: "complete",
          data: {
            workspace: {
              id: workspace.id,
              slug: workspace.slug || "",
              name: workspace.name,
            },
          },
        });
      } catch (error) {
        const totalMs = Date.now() - autogenStart;
        const msg = error instanceof Error ? error.message : "Unknown error";
        logger.error("[AUTOGEN] Error", { message: msg, totalMs, timings: Object.keys(timings).length ? timings : undefined });
        send({ type: "error", data: { message: msg } });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
