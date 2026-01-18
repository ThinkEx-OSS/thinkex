import { google } from "@ai-sdk/google";
import { generateText } from "ai";
import { z } from "zod";
import { logger } from "@/lib/utils/logger";

type FileInfo = { fileUrl: string; filename: string; mediaType: string };

/**
 * Helper function to determine media type from URL
 */
function getMediaTypeFromUrl(url: string): string {
    const urlLower = url.toLowerCase();
    if (urlLower.endsWith('.pdf')) return 'application/pdf';
    if (urlLower.match(/\.(jpg|jpeg)$/)) return 'image/jpeg';
    if (urlLower.endsWith('.png')) return 'image/png';
    if (urlLower.endsWith('.gif')) return 'image/gif';
    if (urlLower.endsWith('.webp')) return 'image/webp';
    if (urlLower.endsWith('.svg')) return 'image/svg+xml';
    if (urlLower.match(/\.(mp4|mov|avi)$/)) return 'video/mp4';
    if (urlLower.match(/\.(mp3|wav|ogg)$/)) return 'audio/mpeg';
    if (urlLower.match(/\.(doc|docx)$/)) return 'application/msword';
    if (urlLower.endsWith('.txt')) return 'text/plain';
    return 'application/octet-stream';
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
        model: google("gemini-2.5-flash"),
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
        model: google("gemini-2.5-flash"),
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
    return {
        description: "Process and analyze files including PDFs, images, documents, and videos. Handles Supabase storage URLs (files uploaded to your workspace) and YouTube videos. Files are downloaded and analyzed directly by Gemini. You can provide custom instructions for what to extract or focus on. Use this for file URLs and video URLs, NOT for regular web pages.",
        inputSchema: z.object({
            jsonInput: z.string().describe("JSON string containing an object with 'urls' (array of file/video URLs) and optional 'instruction' (string for custom analysis). Example: '{\"urls\": [\"https://...storage.../file.pdf\"], \"instruction\": \"summarize key points\"}'"),
        }),
        execute: async ({ jsonInput }: { jsonInput: string }) => {
            let parsed;
            try {
                parsed = JSON.parse(jsonInput);
            } catch (e) {
                logger.error("❌ [FILE_TOOL] Failed to parse JSON input:", e);
                return "Error: Input must be a valid JSON string.";
            }

            const urlList = parsed.urls || [];
            const instruction = parsed.instruction;

            if (!urlList || urlList.length === 0) {
                return "No file URLs provided";
            }

            if (urlList.length > 20) {
                return `Too many files (${urlList.length}). Maximum 20 files allowed.`;
            }

            // Separate Supabase file URLs from YouTube URLs
            const supabaseUrls = urlList.filter((url: string) => url.includes('supabase.co/storage'));
            const youtubeUrls = urlList.filter((url: string) => url.match(/^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/));

            const fileResults: string[] = [];

            // Handle Supabase file URLs
            if (supabaseUrls.length > 0) {
                try {
                    const result = await processSupabaseFiles(supabaseUrls, instruction);
                    fileResults.push(result);
                } catch (error) {
                    logger.error("📁 [FILE_TOOL] Error in Supabase file processing:", error);
                    fileResults.push(`Error processing Supabase files: ${error instanceof Error ? error.message : String(error)}`);
                }
            }

            // LIMITATION: Gemini only supports one video file per request
            if (youtubeUrls.length > 1) {
                logger.warn("📁 [FILE_TOOL] Gemini supports only one video per request. Processing first, ignoring others.");
                fileResults.push(`⚠️ Note: Only one video can be processed at a time. Processing the first video, others were ignored.`);
            }

            if (youtubeUrls.length > 0) {
                try {
                    const result = await processYouTubeVideo(youtubeUrls[0], instruction);
                    fileResults.push(result);
                } catch (videoError) {
                    logger.error("📁 [FILE_TOOL] Error processing YouTube video:", {
                        url: youtubeUrls[0],
                        error: videoError instanceof Error ? videoError.message : String(videoError),
                    });
                    fileResults.push(`Error processing video ${youtubeUrls[0]}: ${videoError instanceof Error ? videoError.message : String(videoError)}`);
                }
            }

            if (fileResults.length === 0) {
                return "No files were successfully processed";
            }

            return fileResults.join('\n\n---\n\n');
        },
    };
}
