import { google } from "@ai-sdk/google";
import { generateText, tool, zodSchema } from "ai";
import { z } from "zod";
import { logger } from "@/lib/utils/logger";
import { readFile } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";

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

    const batchPrompt = instruction
        ? `Analyze the following ${fileInfos.length} file(s):\n${fileListText}\n\n${instruction}\n\nProvide your analysis for each file, clearly labeled with the filename.`
        : `Analyze the following ${fileInfos.length} file(s):\n${fileListText}\n\nFor each file, extract and summarize:\n- Main topics, themes, or subject matter\n- Key information, data, or details\n- Important facts or insights\n- Any structured data, lists, or specific information\n\nProvide a clear, comprehensive analysis for each file, clearly labeled with the filename.`;

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
        model: google("gemini-flash-lite-latest"),
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

    const batchPrompt = instruction
        ? `Analyze the following ${fileInfos.length} file(s):\n${fileListText}\n\n${instruction}\n\nProvide your analysis for each file, clearly labeled with the filename.`
        : `Analyze the following ${fileInfos.length} file(s):\n${fileListText}\n\nFor each file, extract and summarize:\n- Main topics, themes, or subject matter\n- Key information, data, or details\n- Important facts or insights\n- Any structured data, lists, or specific information\n\nProvide a clear, comprehensive analysis for each file, clearly labeled with the filename.`;

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
        model: google("gemini-flash-lite-latest"),
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
        ? `Analyze this video. ${instruction}`
        : `Analyze this video. Extract and summarize:
- Main topics and key points
- Important details and visual information
- Any specific data or insights relevant to the user's question

Provide a clear, comprehensive analysis of the video content.`;

    const { text: videoAnalysis } = await generateText({
        model: google("gemini-flash-lite-latest"),
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
export function createProcessFilesTool() {
    return tool({
        description: "Process and analyze files including PDFs, images, documents, and videos. Handles local file URLs (/api/files/...), Supabase storage URLs (files uploaded to your workspace), and YouTube videos. Files are downloaded and analyzed directly by Gemini. You can provide custom instructions for what to extract or focus on. Use this for file URLs and video URLs, NOT for regular web pages.",
        inputSchema: zodSchema(
            z.object({
                jsonInput: z.string().describe("JSON string containing an object with 'urls' (array of file/video URLs) and optional 'instruction' (string for custom analysis). Example: '{\"urls\": [\"https://...storage.../file.pdf\"], \"instruction\": \"summarize key points\"}'"),
            })
        ),
        execute: async ({ jsonInput }) => {
            let parsed;
            try {
                parsed = JSON.parse(jsonInput);
            } catch (e) {
                logger.error("❌ [FILE_TOOL] Failed to parse JSON input:", e);
                return "Error: Input must be a valid JSON string.";
            }

            // Validate parsed JSON shape
            if (typeof parsed !== 'object' || parsed === null) {
                return "Error: Input must be a JSON object with 'urls' array.";
            }

            const urlList = parsed.urls;
            const instruction = parsed.instruction;

            if (!Array.isArray(urlList)) {
                return "Error: 'urls' must be an array.";
            }

            if (urlList.length === 0) {
                return "No file URLs provided";
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

            if (fileResults.length === 0) {
                return "No files were successfully processed";
            }

            return fileResults.join('\n\n---\n\n');
        },
    });
}
