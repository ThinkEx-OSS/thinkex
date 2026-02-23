import { google } from "@ai-sdk/google";
import { generateText, tool, zodSchema } from "ai";
import { z } from "zod";
import { logger } from "@/lib/utils/logger";
import { headers } from "next/headers";
import { loadStateForTool, fuzzyMatchItem } from "./tool-utils";
import type { WorkspaceToolContext } from "./workspace-tools";
import type { Item, PdfData } from "@/lib/workspace-state/types";
import { workspaceWorker } from "@/lib/ai/workers";
import { formatOcrPagesAsMarkdown } from "@/lib/utils/format-workspace-context";

type FileInfo = { fileUrl: string; filename: string; mediaType: string };

/**
 * Helper function to determine media type from URL
 */
function getMediaTypeFromUrl(url: string): string {
    // Strip query string and fragment before checking extension
    const urlPath = url.split('?')[0].split('#')[0].toLowerCase();

    if (urlPath.endsWith('.pdf')) return 'application/pdf';
    if (urlPath.match(/\.(jpg|jpeg)$/)) return 'image/jpeg';
    if (urlPath.endsWith('.png')) return 'image/png';
    if (urlPath.endsWith('.gif')) return 'image/gif';
    if (urlPath.endsWith('.webp')) return 'image/webp';
    if (urlPath.endsWith('.svg')) return 'image/svg+xml';
    if (urlPath.endsWith('.mp4')) return 'video/mp4';
    if (urlPath.endsWith('.mov')) return 'video/quicktime';
    if (urlPath.endsWith('.avi')) return 'video/x-msvideo';
    if (urlPath.endsWith('.mp3')) return 'audio/mpeg';
    if (urlPath.endsWith('.wav')) return 'audio/wav';
    if (urlPath.endsWith('.ogg')) return 'audio/ogg';
    if (urlPath.endsWith('.doc')) return 'application/msword';
    if (urlPath.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    if (urlPath.endsWith('.txt')) return 'text/plain';
    return 'application/octet-stream';
}

const IMAGE_MEDIA_TYPES = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml',
];

function isPdf(mediaType: string): boolean {
    return mediaType === 'application/pdf';
}

function isImage(mediaType: string): boolean {
    return IMAGE_MEDIA_TYPES.includes(mediaType);
}

function buildFileProcessingPrompt(
    fileInfos: Array<{ filename: string; mediaType: string }>
): { defaultInstruction: string; outputFormat: string } {
    const hasPdfs = fileInfos.some((f) => isPdf(f.mediaType));
    const hasImages = fileInfos.some((f) => isImage(f.mediaType));
    const hasOther = fileInfos.some((f) => !isPdf(f.mediaType) && !isImage(f.mediaType));

    const parts: string[] = [];
    if (hasPdfs) {
        parts.push(
            'For PDFs: Extract the exact textual content in markdown format. Preserve layout: headings (# ## ###), bullet/numbered lists, tables, paragraphs, and structure. Include all text verbatim where possible.'
        );
    }
    if (hasImages) {
        parts.push('For images: Provide a brief summary of what the image shows, its subject, and any notable details.');
    }
    if (hasOther) {
        parts.push(
            'For other files (documents, audio, video): Extract or summarize the main content, key points, and important information.'
        );
    }

    const defaultInstruction = parts.join('\n\n');

    const outputFormat = `Format each file's output as:
**filename.ext:**
[Content — for PDFs use markdown with preserved layout; for images use a short summary]`;

    return { defaultInstruction, outputFormat };
}

/**
 * Process Supabase storage files by sending URLs directly to Gemini
 */
async function processSupabaseFiles(
    supabaseUrls: string[],
    instruction?: string
): Promise<string> {
    const fileInfos: FileInfo[] = supabaseUrls.map((fileUrl: string) => {
        const filename = decodeURIComponent(fileUrl.split('/').pop() || 'file');
        const mediaType = getMediaTypeFromUrl(fileUrl);
        return { fileUrl, filename, mediaType };
    });

    const fileListText = fileInfos.map((f, i) => `${i + 1}. ${f.filename}`).join('\n');
    const { defaultInstruction, outputFormat } = buildFileProcessingPrompt(fileInfos);

    const batchPrompt = instruction
        ? `Analyze the following ${fileInfos.length} file(s):\n${fileListText}\n\n${instruction}\n\n${outputFormat}`
        : `Analyze the following ${fileInfos.length} file(s):\n${fileListText}\n\n${defaultInstruction}\n\n${outputFormat}`;

    const messageContent: Array<{ type: "text"; text: string } | { type: "file"; data: string; mediaType: string; filename?: string }> = [
        { type: "text", text: batchPrompt },
        ...fileInfos.map((f) => ({
            type: "file" as const,
            data: f.fileUrl,
            mediaType: f.mediaType,
            filename: f.filename,
        })),
    ];

    logger.debug("📁 [FILE_TOOL] Sending batched analysis request for", fileInfos.length, "files with URLs");

    const { text: batchAnalysis } = await generateText({
        model: google("gemini-2.5-flash-lite"),
        messages: [{
            role: "user",
            content: messageContent,
        }],
    });

    logger.debug("📁 [FILE_TOOL] Successfully analyzed", fileInfos.length, "files in batch");
    return batchAnalysis;
}

/**
 * Run OCR on a PDF via the /api/pdf/ocr endpoint.
 * Reuses the same upload+extract logic as workspace dropzone/upload flows.
 * Returns extracted text and pages, or null on failure.
 */
async function runOcrForPdfUrl(fileUrl: string): Promise<{
    textContent: string;
    ocrPages: PdfData["ocrPages"];
} | null> {
    const baseUrl =
        process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    let cookie: string | undefined;
    try {
        const headersList = await headers();
        cookie = headersList.get("cookie") ?? undefined;
    } catch {
        // No request context (e.g. background job)
    }

    const res = await fetch(`${baseUrl}/api/pdf/ocr`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...(cookie && { cookie }),
        },
        body: JSON.stringify({ fileUrl }),
    });

    const json = await res.json();
    if (!res.ok || json.error || !json.textContent) {
        logger.warn("📁 [FILE_TOOL] OCR failed for PDF:", {
            url: fileUrl.slice(0, 80),
            error: json.error || res.statusText,
        });
        return null;
    }

    return {
        textContent: json.textContent,
        ocrPages: json.ocrPages ?? undefined,
    };
}

type PdfImageRef = { pdfName: string; imageId: string };

/**
 * Process images extracted from PDF OCR (resolve placeholder refs like img-0.jpeg or p5-img-0.jpeg to base64).
 */
async function processPdfImages(
    pdfImageRefs: PdfImageRef[],
    stateItems: Item[],
    instruction?: string
): Promise<string> {
    const fileInfos: Array<{ filename: string; mediaType: string; data: string }> = [];

    for (const ref of pdfImageRefs) {
        const pdfItem = fuzzyMatchItem(stateItems, ref.pdfName);
        if (!pdfItem || pdfItem.type !== "pdf") continue;

        const pdfData = pdfItem.data as PdfData;
        const ocrPages = pdfData.ocrPages ?? [];

        for (const page of ocrPages) {
            const images = (page.images ?? []) as Array<{ id?: string; image_base64?: string; imageBase64?: string }>;
            const img = images.find((i) => i.id === ref.imageId);
            if (!img) continue;

            const base64 = img.image_base64 ?? img.imageBase64;
            if (!base64 || typeof base64 !== "string") continue;

            const dataUrl =
                base64.startsWith("data:") ? base64 : `data:image/png;base64,${base64}`;
            const mediaType = ref.imageId.toLowerCase().match(/\.(jpe?g|png|gif|webp)$/)
                ? (ref.imageId.endsWith(".png") ? "image/png"
                    : ref.imageId.match(/\.jpe?g$/i) ? "image/jpeg"
                        : ref.imageId.endsWith(".gif") ? "image/gif"
                            : "image/webp")
                : "image/png";

            fileInfos.push({ filename: ref.imageId, mediaType, data: dataUrl });
            break;
        }
    }

    if (fileInfos.length === 0) {
        return "No PDF images could be found. Ensure the PDF was OCR'd with images (OCR_INCLUDE_IMAGES not false) and the imageId matches the placeholder (e.g. img-0.jpeg or p5-img-0.jpeg).";
    }

    const fileListText = fileInfos.map((f, i) => `${i + 1}. ${f.filename} (from PDF)`).join("\n");
    const { defaultInstruction, outputFormat } = buildFileProcessingPrompt(fileInfos);
    const batchPrompt = instruction
        ? `Analyze the following ${fileInfos.length} image(s) extracted from PDFs:\n${fileListText}\n\n${instruction}\n\n${outputFormat}`
        : `Analyze the following ${fileInfos.length} image(s) extracted from PDFs:\n${fileListText}\n\n${defaultInstruction}\n\n${outputFormat}`;

    const messageContent: Array<{ type: "text"; text: string } | { type: "file"; data: string; mediaType: string; filename?: string }> = [
        { type: "text", text: batchPrompt },
        ...fileInfos.map((f) => ({
            type: "file" as const,
            data: f.data,
            mediaType: f.mediaType,
            filename: f.filename,
        })),
    ];

    const { text: batchAnalysis } = await generateText({
        model: google("gemini-2.5-flash-lite"),
        messages: [{ role: "user", content: messageContent }],
    });

    return batchAnalysis;
}

/**
 * Process a YouTube video using Gemini's native video support
 */
async function processYouTubeVideo(
    youtubeUrl: string,
    instruction?: string
): Promise<string> {
    logger.debug("📁 [FILE_TOOL] Processing YouTube URL natively:", youtubeUrl);

    const videoPrompt = instruction
        ? `Analyze this video. ${instruction}\n\nFormat your response as:\n**Summary:** [2-3 sentences]\n**Key points:** [bullet list]`
        : `Analyze this video. Extract and summarize main topics, key points, important details, and any specific data or insights.\n\nFormat your response as:\n**Summary:** [2-3 sentences]\n**Key points:** [bullet list]`;

    const { text: videoAnalysis } = await generateText({
        model: google("gemini-2.5-flash-lite"),
        messages: [{
            role: "user",
            content: [
                { type: "text", text: videoPrompt },
                {
                    type: "file",
                    data: youtubeUrl,
                    mediaType: "video/mp4",
                },
            ],
        }],
    });

    logger.debug("📁 [FILE_TOOL] Successfully processed YouTube video:", youtubeUrl);
    return `**Video: ${youtubeUrl}**\n\n${videoAnalysis}`;
}

/**
 * Create the processFiles tool
 */
export function createProcessFilesTool(ctx?: WorkspaceToolContext) {
    return tool({
        description: "Process and analyze files including PDFs, images, documents, and videos. Handles Supabase storage URLs (files uploaded to your workspace), YouTube videos, and images from PDFs (use pdfImageRefs for placeholders like img-0.jpeg from readWorkspace). Use processFiles for file URLs, video URLs, workspace file names (fuzzy matched), OR pdfImageRefs to analyze images inside PDFs. For workspace PDFs without extracted content, processFiles extracts and caches the result; if extraction fails it falls back to Gemini via the file URL. If a PDF is still extracting, respond that the user should wait. If a PDF has cached content it will be returned automatically — set forceReprocess to true to bypass the cache. Cloud storage URLs only.",
        inputSchema: zodSchema(
            z.object({
                urls: z.array(z.string()).optional().describe("Array of file/video URLs to process (Supabase storage URLs or YouTube URLs)"),
                fileNames: z.array(z.string()).optional().describe("Array of workspace item names to look up via fuzzy match (e.g. 'Annual Report')"),
                pdfImageRefs: z.array(z.object({
                    pdfName: z.string().describe("Name of the PDF workspace item (fuzzy matched)"),
                    imageId: z.string().describe("Image placeholder ID from PDF (e.g. img-0.jpeg)"),
                })).optional().describe("Images from PDFs — map placeholder names to base64 for analysis"),
                instruction: z.string().optional().describe("Custom instruction for what to extract or focus on during analysis"),
                forceReprocess: z.boolean().optional().describe("Set to true to bypass cached PDF content and re-analyze the file"),
            })
        ),
        execute: async ({ urls, fileNames: fileNamesInput, pdfImageRefs, instruction, forceReprocess: forceReprocessInput }) => {
            let urlList = urls || [];
            const fileNames = fileNamesInput || [];
            const forceReprocess = forceReprocessInput === true;

            const cachedResults: string[] = [];

            // Resolve file names to URLs using fuzzy matching if context is available
            if (fileNames && Array.isArray(fileNames) && fileNames.length > 0) {
                if (ctx && ctx.workspaceId) {
                    try {
                        const accessResult = await loadStateForTool(ctx);
                        if (accessResult.success) {
                            const { state } = accessResult;
                            const notFoundData: string[] = [];

                            for (const name of fileNames) {
                                // Try to match any item type that might contain a file
                                const matchedItem = fuzzyMatchItem(state.items, name);

                                if (matchedItem) {
                                    if (matchedItem.type === 'pdf') {
                                        const pdfData = matchedItem.data as PdfData;

                                        // Use cached content only when we have actual OCR (ocrPages); textContent alone may be from Gemini/summary
                                        if (pdfData.ocrPages?.length && pdfData.textContent && !forceReprocess) {
                                            const formatted = formatOcrPagesAsMarkdown(pdfData.ocrPages);
                                            logger.debug(`📁 [FILE_TOOL] Using cached OCR content for "${name}" (${formatted.length} chars)`);
                                            cachedResults.push(`**${matchedItem.name}** (cached):\n\n${formatted}`);
                                            continue; // Skip adding to urlList — no reprocessing needed
                                        }

                                        // OCR already running in background from upload — respond instead of Gemini fallback
                                        if (pdfData.ocrStatus === "processing") {
                                            cachedResults.push(`**${matchedItem.name}**: This PDF is still being extracted. Please wait a moment and try again.`);
                                            logger.debug(`📁 [FILE_TOOL] PDF "${name}" still processing — responding with wait message`);
                                            continue;
                                        }

                                        if (pdfData.fileUrl) {
                                            // Try OCR first (reuses upload+extract logic); fall back to Supabase URL if OCR fails
                                            const ocrResult = await runOcrForPdfUrl(pdfData.fileUrl);
                                            if (ocrResult) {
                                                const formatted = ocrResult.ocrPages?.length
                                                    ? formatOcrPagesAsMarkdown(ocrResult.ocrPages)
                                                    : ocrResult.textContent;
                                                logger.debug(`📁 [FILE_TOOL] OCR extracted content for "${name}" (${formatted.length} chars)`);
                                                cachedResults.push(`**${matchedItem.name}** (extracted):\n\n${formatted}`);
                                                // Persist OCR result so future calls use cached content
                                                try {
                                                    await workspaceWorker("updatePdfContent", {
                                                        workspaceId: ctx.workspaceId!,
                                                        itemId: matchedItem.id,
                                                        pdfTextContent: ocrResult.textContent,
                                                        pdfOcrPages: ocrResult.ocrPages,
                                                        pdfOcrStatus: "complete",
                                                    });
                                                    logger.debug(`📁 [FILE_TOOL] Persisted OCR content for PDF "${matchedItem.name}"`);
                                                } catch (cacheErr) {
                                                    logger.warn(`📁 [FILE_TOOL] Failed to persist OCR for "${matchedItem.name}":`, cacheErr);
                                                }
                                                continue; // Don't add to urlList
                                            }
                                            // OCR failed — fall back to Supabase URL (Gemini)
                                            urlList.push(pdfData.fileUrl);
                                            logger.debug(`📁 [FILE_TOOL] Resolved file name "${name}" to URL (Supabase fallback): ${pdfData.fileUrl}`);
                                        } else {
                                            notFoundData.push(`Item "${name}" found but has no file URL.`);
                                        }
                                    } else if (matchedItem.type === 'youtube') {
                                        // Handle YouTube items if we want to support them via name too
                                        const ytData = matchedItem.data as any; // Cast to avoid full import cycle if possible, or just use 'any' safely
                                        if (ytData.url) {
                                            urlList.push(ytData.url);
                                            logger.debug(`📁 [FILE_TOOL] Resolved video name "${name}" to URL: ${ytData.url}`);
                                        }
                                    } else {
                                        notFoundData.push(`Item "${name}" found but is type "${matchedItem.type}" which is not a file/video.`);
                                    }
                                } else {
                                    notFoundData.push(`Could not find file with name "${name}".`);
                                }
                            }

                            if (notFoundData.length > 0) {
                                logger.warn("📁 [FILE_TOOL] Some file names could not be resolved:", notFoundData);
                            }
                        }
                    } catch (error) {
                        logger.error("📁 [FILE_TOOL] Error resolving file names:", error);
                    }
                } else {
                    logger.warn("📁 [FILE_TOOL] fileNames provided but no workspace context available for resolution.");
                }
            }

            // Handle PDF image refs (placeholders like img-0.jpeg from OCR)
            const pdfImageResults: string[] = [];
            if (pdfImageRefs && pdfImageRefs.length > 0 && ctx?.workspaceId) {
                try {
                    const accessResult = await loadStateForTool(ctx);
                    if (accessResult.success) {
                        const result = await processPdfImages(
                            pdfImageRefs,
                            accessResult.state.items,
                            instruction
                        );
                        pdfImageResults.push(result);
                    }
                } catch (e) {
                    logger.error("📁 [FILE_TOOL] Error processing PDF images:", e);
                    pdfImageResults.push(`Error processing PDF images: ${e instanceof Error ? e.message : String(e)}`);
                }
            }

            // If all requested files had cached content and no other work, return early
            if (cachedResults.length > 0 && urlList.length === 0 && pdfImageResults.length === 0) {
                return cachedResults.join('\n\n---\n\n');
            }

            if (!Array.isArray(urlList)) {
                return "Error: 'urls' must be an array.";
            }

            // If only pdfImageRefs were provided and we processed them, return those
            if (urlList.length === 0 && pdfImageResults.length > 0) {
                return pdfImageResults.join("\n\n---\n\n");
            }

            if (urlList.length === 0) {
                return "No file URLs provided (and no file names or pdfImageRefs could be resolved).";
            }

            if (urlList.length > 20) {
                return `Too many files (${urlList.length}). Maximum 20 files allowed.`;
            }

            // Separate file URLs by type (cloud only — no local /api/files/)
            const supabaseUrls = urlList.filter((url: string) => url.includes('supabase.co/storage'));
            const youtubeUrls = urlList.filter((url: string) => url.match(/^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/));

            const skippedLocal = urlList.filter((url: string) => url.includes('/api/files/'));
            if (skippedLocal.length > 0) {
                logger.debug(`📁 [FILE_TOOL] Skipping ${skippedLocal.length} local file URL(s) — cloud storage only`);
            }

            if (supabaseUrls.length === 0 && youtubeUrls.length === 0) {
                return skippedLocal.length > 0
                    ? "Local file URLs (/api/files/...) are not supported. Use Supabase storage URLs (files uploaded to your workspace) or YouTube URLs."
                    : "No file URLs provided (and no file names or pdfImageRefs could be resolved).";
            }

            const fileResults: string[] = [];

            // Process different file types in parallel using Promise.all()
            const processingPromises: Promise<string | null>[] = [];

            // Handle Supabase file URLs
            if (supabaseUrls.length > 0) {
                processingPromises.push(
                    processSupabaseFiles(supabaseUrls, instruction)
                        .then(result => result)
                        .catch(error => {
                            logger.error("📁 [FILE_TOOL] Error in Supabase file processing:", error);
                            return `Error processing Supabase files: ${error instanceof Error ? error.message : String(error)}`;
                        })
                );
            }

            // LIMITATION: Gemini only supports one video file per request
            if (youtubeUrls.length > 1) {
                logger.warn("📁 [FILE_TOOL] Gemini supports only one video per request. Processing first, ignoring others.");
                fileResults.push(`⚠️ Note: Only one video can be processed at a time. Processing the first video, others were ignored.`);
            }

            // Handle YouTube videos
            if (youtubeUrls.length > 0) {
                processingPromises.push(
                    processYouTubeVideo(youtubeUrls[0], instruction)
                        .then(result => result)
                        .catch(videoError => {
                            logger.error("📁 [FILE_TOOL] Error processing YouTube video:", {
                                url: youtubeUrls[0],
                                error: videoError instanceof Error ? videoError.message : String(videoError),
                            });
                            return `Error processing video ${youtubeUrls[0]}: ${videoError instanceof Error ? videoError.message : String(videoError)}`;
                        })
                );
            }

            // Execute all file type processing in parallel
            if (processingPromises.length > 0) {
                const results = await Promise.all(processingPromises);
                fileResults.push(...results.filter((r): r is string => r !== null));
            }

            // Never persist Gemini analysis to PDF items — only Azure OCR (runOcrForPdfUrl) writes ocrPages/textContent

            // Prepend cached results if we had a mix of cached + freshly processed
            if (cachedResults.length > 0) {
                fileResults.unshift(...cachedResults);
            }

            if (pdfImageResults.length > 0) {
                fileResults.push(...pdfImageResults);
            }

            if (fileResults.length === 0) {
                return "No files were successfully processed";
            }

            return fileResults.join('\n\n---\n\n');
        },
    });
}
