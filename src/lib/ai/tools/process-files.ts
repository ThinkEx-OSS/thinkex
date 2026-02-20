import { google } from "@ai-sdk/google";
import { generateText, tool, zodSchema } from "ai";
import { z } from "zod";
import { logger } from "@/lib/utils/logger";
import { readFile } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";
import { loadStateForTool, fuzzyMatchItem } from "./tool-utils";
import type { WorkspaceToolContext } from "./workspace-tools";
import type { Item, PdfData } from "@/lib/workspace-state/types";
import { workspaceWorker } from "@/lib/ai/workers";

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
 * Extract filename from local file URL
 */
function extractLocalFilename(url: string): string | null {
    // Match: http://localhost:3000/api/files/filename or /api/files/filename
    const match = url.match(/\/api\/files\/(.+?)(?:\?|$)/);
    return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Process local files by reading from disk and sending as base64 to Gemini
 */
async function processLocalFiles(
    localUrls: string[],
    instruction?: string
): Promise<string> {
    const uploadsDir = process.env.UPLOADS_DIR || join(process.cwd(), 'uploads');
    const fileInfos: Array<{ filename: string; mediaType: string; data: string }> = [];

    for (const url of localUrls) {
        const filename = extractLocalFilename(url);
        if (!filename) {
            logger.warn(`📁 [FILE_TOOL] Could not extract filename from local URL: ${url}`);
            continue;
        }

        // Security: Prevent directory traversal (slash and backslash for Windows)
        if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
            logger.warn(`📁 [FILE_TOOL] Invalid filename detected: ${filename}`);
            continue;
        }

        const filePath = join(uploadsDir, filename);

        if (!existsSync(filePath)) {
            logger.warn(`📁 [FILE_TOOL] File not found: ${filePath}`);
            continue;
        }

        try {
            const fileBuffer = await readFile(filePath);
            const base64Data = fileBuffer.toString('base64');
            const mediaType = getMediaTypeFromUrl(url);

            fileInfos.push({
                filename,
                mediaType,
                data: `data:${mediaType};base64,${base64Data}`,
            });
        } catch (error) {
            logger.error(`📁 [FILE_TOOL] Error reading local file ${filePath}:`, error);
            continue;
        }
    }

    if (fileInfos.length === 0) {
        return "No local files could be processed";
    }

    const fileListText = fileInfos.map((f, i) => `${i + 1}. ${f.filename}`).join('\n');
    const { defaultInstruction, outputFormat } = buildFileProcessingPrompt(fileInfos);

    const batchPrompt = instruction
        ? `Analyze the following ${fileInfos.length} file(s):\n${fileListText}\n\n${instruction}\n\n${outputFormat}`
        : `Analyze the following ${fileInfos.length} file(s):\n${fileListText}\n\n${defaultInstruction}\n\n${outputFormat}`;

    const messageContent: Array<{ type: "text"; text: string } | { type: "file"; data: string; mediaType: string; filename?: string }> = [
        { type: "text", text: batchPrompt },
        ...fileInfos.map((f) => ({
            type: "file" as const,
            data: f.data,
            mediaType: f.mediaType,
            filename: f.filename,
        })),
    ];

    logger.debug("📁 [FILE_TOOL] Sending batched analysis request for", fileInfos.length, "local files");

    const { text: batchAnalysis } = await generateText({
        model: google("gemini-2.5-flash-lite"),
        messages: [{
            role: "user",
            content: messageContent,
        }],
    });

    logger.debug("📁 [FILE_TOOL] Successfully analyzed", fileInfos.length, "local files in batch");
    return batchAnalysis;
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
        description: "Process and analyze files including PDFs, images, documents, and videos. Handles local file URLs (/api/files/...), Supabase storage URLs (files uploaded to your workspace), and YouTube videos. Files are downloaded and analyzed directly by Gemini. You can provide custom instructions for what to extract or focus on. Use this for file URLs, video URLs, OR by providing the names of files/videos existing in the workspace (fuzzy matched). If a PDF has cached content it will be returned automatically — set forceReprocess to true to bypass the cache and re-analyze with a custom instruction.",
        inputSchema: zodSchema(
            z.object({
                urls: z.array(z.string()).optional().describe("Array of file/video URLs to process (Supabase storage URLs, local /api/files/ URLs, or YouTube URLs)"),
                fileNames: z.array(z.string()).optional().describe("Array of workspace item names to look up via fuzzy match (e.g. 'Annual Report')"),
                instruction: z.string().optional().describe("Custom instruction for what to extract or focus on during analysis"),
                forceReprocess: z.boolean().optional().describe("Set to true to bypass cached PDF content and re-analyze the file"),
            })
        ),
        execute: async ({ urls, fileNames: fileNamesInput, instruction, forceReprocess: forceReprocessInput }) => {
            let urlList = urls || [];
            const fileNames = fileNamesInput || [];
            const forceReprocess = forceReprocessInput === true;

            // Track matched PDF items for auto-caching after extraction
            const matchedPdfItems: Map<string, Item> = new Map(); // fileUrl -> Item
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

                                        // Check for cached text content first (skip if forceReprocess)
                                        if (pdfData.textContent && !forceReprocess) {
                                            logger.debug(`📁 [FILE_TOOL] Using cached text content for "${name}" (${pdfData.textContent.length} chars)`);
                                            cachedResults.push(`**${matchedItem.name}** (cached):\n\n${pdfData.textContent}`);
                                            continue; // Skip adding to urlList — no reprocessing needed
                                        }

                                        if (pdfData.fileUrl) {
                                            urlList.push(pdfData.fileUrl);
                                            matchedPdfItems.set(pdfData.fileUrl, matchedItem);
                                            logger.debug(`📁 [FILE_TOOL] Resolved file name "${name}" to URL: ${pdfData.fileUrl}`);
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

            // If all requested files had cached content, return early
            if (cachedResults.length > 0 && urlList.length === 0) {
                return cachedResults.join('\n\n---\n\n');
            }

            if (!Array.isArray(urlList)) {
                return "Error: 'urls' must be an array.";
            }

            if (urlList.length === 0) {
                return "No file URLs provided (and no file names could be resolved).";
            }

            if (urlList.length > 20) {
                return `Too many files (${urlList.length}). Maximum 20 files allowed.`;
            }

            // Separate file URLs by type
            const supabaseUrls = urlList.filter((url: string) => url.includes('supabase.co/storage'));
            const localUrls = urlList.filter((url: string) => url.includes('/api/files/'));
            const youtubeUrls = urlList.filter((url: string) => url.match(/^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/));

            const fileResults: string[] = [];

            // Process different file types in parallel using Promise.all()
            const processingPromises: Promise<string | null>[] = [];

            // Handle local file URLs (read from disk and send as base64)
            if (localUrls.length > 0) {
                processingPromises.push(
                    processLocalFiles(localUrls, instruction)
                        .then(result => result)
                        .catch(error => {
                            logger.error("📁 [FILE_TOOL] Error in local file processing:", error);
                            return `Error processing local files: ${error instanceof Error ? error.message : String(error)}`;
                        })
                );
            }

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

            // Auto-persist extracted content to matched PDF items (fire-and-forget)
            if (matchedPdfItems.size > 0 && ctx?.workspaceId && fileResults.length > 0) {
                const combinedResult = fileResults.join('\n\n---\n\n');
                for (const [fileUrl, item] of matchedPdfItems) {
                    try {
                        await workspaceWorker("updatePdfContent", {
                            workspaceId: ctx.workspaceId,
                            itemId: item.id,
                            pdfTextContent: combinedResult,
                        });
                        logger.debug(`📁 [FILE_TOOL] Auto-cached extracted content for PDF "${item.name}" (${combinedResult.length} chars)`);
                    } catch (cacheError) {
                        // Non-fatal: log but don't fail the tool call
                        logger.warn(`📁 [FILE_TOOL] Failed to auto-cache content for PDF "${item.name}":`, cacheError);
                    }
                }
            }

            // Prepend cached results if we had a mix of cached + freshly processed
            if (cachedResults.length > 0) {
                fileResults.unshift(...cachedResults);
            }

            if (fileResults.length === 0) {
                return "No files were successfully processed";
            }

            return fileResults.join('\n\n---\n\n');
        },
    });
}
