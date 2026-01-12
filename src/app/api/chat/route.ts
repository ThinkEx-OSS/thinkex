import { google, type GoogleGenerativeAIProviderMetadata } from "@ai-sdk/google";
import { GoogleGenAI } from "@google/genai";
import { frontendTools } from "@assistant-ui/react-ai-sdk";
import { streamText, generateText, convertToModelMessages, stepCountIs } from "ai";
import { z } from "zod";
import { logger } from "@/lib/utils/logger";
import {
  searchWorker,
  codeExecutionWorker,
  workspaceWorker,
  textSelectionWorker,
} from "@/lib/ai/workers";
import { loadWorkspaceState } from "@/lib/workspace/state-loader";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { cookies } from "next/headers";
import { randomUUID } from "crypto";
import { db, workspaces } from "@/lib/db/client";
import { eq } from "drizzle-orm";
import { createClient } from "@supabase/supabase-js";

// Initialize Supabase Admin Client for secure storage access
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

export const maxDuration = 30;

/**
 * Extract workspaceId from system context or request body
 * The workspaceId is passed from the frontend through the request body or system context
 */
function extractWorkspaceId(body: any): string | null {
  // Check if workspaceId is directly passed in the request body
  if (body.workspaceId) {
    return body.workspaceId;
  }

  // Extract from system context - look for "Workspace ID: <id>" pattern
  const system = body.system || "";
  const workspaceIdMatch = system.match(/Workspace ID: ([a-f0-9-]{36})/);
  if (workspaceIdMatch) {
    return workspaceIdMatch[1];
  }

  return null;
}

export async function POST(req: Request) {
  let workspaceId: string | null = null;
  let activeFolderId: string | undefined;
  try {
    // Get authenticated user ID from better-auth (supports anonymous users)
    const session = await auth.api.getSession({
      headers: await headers(),
    });
    // Allow anonymous users - userId can be from anonymous session
    const userId = session?.user?.id || null;

    const body = await req.json();

    const messages = body.messages || [];
    const system = body.system || "";
    workspaceId = extractWorkspaceId(body);
    activeFolderId = body.activeFolderId;

    let convertedMessages;
    try {
      convertedMessages = await convertToModelMessages(messages);
    } catch (convertError) {
      logger.error("❌ [CHAT-API] convertToModelMessages FAILED:", {
        error: convertError instanceof Error ? convertError.message : String(convertError),
        stack: convertError instanceof Error ? convertError.stack : undefined,
      });
      throw convertError;
    }

    // Extract file URLs from FILE_URL markers for the processFiles tool hint
    // Keep markers as text - the model will use processFiles tool to handle them
    const fileUrls: string[] = [];
    const fileUrlRegex = /\[FILE_URL:([^|]+)\|mediaType:([^|]*)\|filename:([^\]]*)\]/g;
    convertedMessages.forEach((message) => {
      if (message.content && Array.isArray(message.content)) {
        message.content.forEach((part) => {
          if (part.type === "text" && typeof part.text === "string") {
            let match;
            while ((match = fileUrlRegex.exec(part.text)) !== null) {
              fileUrls.push(match[1]);
            }
          }
        });
      }
    });

    // Extract URLs from messages to detect if URLs are present
    // The agent will use the processUrls tool to handle them (which shows in UI)
    const urlContextUrls: string[] = [];
    convertedMessages.forEach((message) => {
      if (message.content && Array.isArray(message.content)) {
        message.content.forEach((part) => {
          if (part.type === "text" && typeof part.text === "string") {
            // Look for [URL_CONTEXT:...] markers
            const urlMatches = part.text.matchAll(/\[URL_CONTEXT:(.+?)\]/g);
            for (const match of urlMatches) {
              const url = match[1];
              if (url && !urlContextUrls.includes(url)) {
                urlContextUrls.push(url);
              }
            }
            // Also look for direct URLs in text
            const directUrlMatches = part.text.matchAll(/https?:\/\/[^\s]+/g);
            for (const match of directUrlMatches) {
              const url = match[0];
              if (url && !urlContextUrls.includes(url)) {
                urlContextUrls.push(url);
              }
            }
          }
        });
      }
    });

    // Main workspace processing (using custom tools only)
    // Use the model selected by the user, with fallback to gemini-2.5-pro
    const modelId = body.modelId || "gemini-2.5-pro";
    const model = google(modelId);


    // Safeguard frontendTools
    let clientTools = {};
    try {
      clientTools = frontendTools(body.tools || {});
    } catch (e) {
      logger.error("❌ frontendTools failed:", e);
    }

    // Build tools object - custom tools only
    const tools: any = {
      // TOOL 0: Process Files (handles Supabase storage files and YouTube videos)
      processFiles: {
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

          // Handle Supabase file URLs by downloading and passing to Gemini in a SINGLE batched call
          if (supabaseUrls.length > 0) {
            try {
              // Step 1: Download all files in parallel
              const downloadPromises = supabaseUrls.map(async (fileUrl: string) => {
                try {
                  // Parse the URL to get bucket and path
                  const urlObj = new URL(fileUrl);
                  const pathParts = urlObj.pathname.split('/storage/v1/object/')[1]?.split('/');

                  if (!pathParts || pathParts.length < 2) {
                    logger.warn("📁 [FILE_TOOL] URL does not match Supabase storage format:", fileUrl);
                    return { success: false, error: `Invalid Supabase URL format: ${fileUrl}` };
                  }

                  let bucket = "";
                  let filePath = "";

                  if (urlObj.pathname.includes('/public/')) {
                    const parts = urlObj.pathname.split('/public/');
                    if (parts[1]) {
                      const bucketAndPath = parts[1].split('/');
                      bucket = bucketAndPath[0];
                      filePath = bucketAndPath.slice(1).join('/');
                    }
                  } else if (urlObj.pathname.includes('/sign/')) {
                    const parts = urlObj.pathname.split('/sign/');
                    if (parts[1]) {
                      const bucketAndPath = parts[1].split('/');
                      bucket = bucketAndPath[0];
                      filePath = bucketAndPath.slice(1).join('/');
                    }
                  } else {
                    logger.warn("📁 [FILE_TOOL] Could not parse bucket/path from URL:", fileUrl);
                    return { success: false, error: `Could not parse URL: ${fileUrl}` };
                  }

                  // Decode URI components
                  bucket = decodeURIComponent(bucket);
                  filePath = decodeURIComponent(filePath);

                  if (!bucket || !filePath) {
                    logger.warn("📁 [FILE_TOOL] Invalid bucket or path:", { bucket, filePath });
                    return { success: false, error: `Invalid bucket or path for: ${fileUrl}` };
                  }

                  logger.debug("📁 [FILE_TOOL] Downloading from storage:", { bucket, filePath });

                  // Download using Admin SDK
                  const { data, error } = await supabaseAdmin
                    .storage
                    .from(bucket)
                    .download(filePath);

                  if (error || !data) {
                    logger.error("📁 [FILE_TOOL] Supabase download error:", error);
                    return { success: false, error: `Download error: ${error?.message || "Unknown error"}` };
                  }

                  // Convert Blob to Base64
                  const arrayBuffer = await data.arrayBuffer();
                  const buffer = Buffer.from(arrayBuffer);
                  const base64Data = buffer.toString('base64');

                  // Determine media type
                  let mediaType = data.type || 'application/octet-stream';
                  const urlLower = fileUrl.toLowerCase();
                  if (mediaType === 'application/octet-stream' || !mediaType) {
                    if (urlLower.endsWith('.pdf')) {
                      mediaType = 'application/pdf';
                    } else if (urlLower.match(/\.(jpg|jpeg)$/)) {
                      mediaType = 'image/jpeg';
                    } else if (urlLower.endsWith('.png')) {
                      mediaType = 'image/png';
                    } else if (urlLower.endsWith('.gif')) {
                      mediaType = 'image/gif';
                    } else if (urlLower.endsWith('.webp')) {
                      mediaType = 'image/webp';
                    } else if (urlLower.endsWith('.svg')) {
                      mediaType = 'image/svg+xml';
                    } else if (urlLower.match(/\.(mp4|mov|avi)$/)) {
                      mediaType = 'video/mp4';
                    } else if (urlLower.match(/\.(mp3|wav|ogg)$/)) {
                      mediaType = 'audio/mpeg';
                    } else if (urlLower.match(/\.(doc|docx)$/)) {
                      mediaType = 'application/msword';
                    } else if (urlLower.endsWith('.txt')) {
                      mediaType = 'text/plain';
                    }
                  }

                  const filename = decodeURIComponent(fileUrl.split('/').pop() || 'file');
                  const dataUrl = `data:${mediaType};base64,${base64Data}`;

                  logger.debug("📁 [FILE_TOOL] Successfully downloaded:", filename);
                  return {
                    success: true,
                    filename,
                    dataUrl,
                    mediaType,
                  };
                } catch (fileError) {
                  logger.error("📁 [FILE_TOOL] Error downloading file:", {
                    url: fileUrl,
                    error: fileError instanceof Error ? fileError.message : String(fileError),
                  });
                  return { success: false, error: `Error downloading ${fileUrl}: ${fileError instanceof Error ? fileError.message : String(fileError)}` };
                }
              });

              // Wait for all downloads to complete in parallel
              const downloadResults = await Promise.all(downloadPromises);

              // Separate successful downloads from errors
              const successfulDownloads = downloadResults.filter((r): r is { success: true; filename: string; dataUrl: string; mediaType: string } => r.success === true);
              const failedDownloads = downloadResults.filter((r): r is { success: false; error: string } => r.success === false);

              // Add errors to results
              failedDownloads.forEach(f => fileResults.push(f.error));

              // Step 2: Analyze all successfully downloaded files in a SINGLE batched AI call
              if (successfulDownloads.length > 0) {
                try {
                  const fileListText = successfulDownloads.map((f, i) => `${i + 1}. ${f.filename}`).join('\n');
                  
                  const batchPrompt = instruction
                    ? `Analyze the following ${successfulDownloads.length} file(s):\n${fileListText}\n\n${instruction}\n\nProvide your analysis for each file, clearly labeled with the filename.`
                    : `Analyze the following ${successfulDownloads.length} file(s):\n${fileListText}\n\nFor each file, extract and summarize:\n- Main topics, themes, or subject matter\n- Key information, data, or details\n- Important facts or insights\n- Any structured data, lists, or specific information\n\nProvide a clear, comprehensive analysis for each file, clearly labeled with the filename.`;

                  // Build message content with all files
                  const messageContent: Array<{ type: "text"; text: string } | { type: "file"; data: string; mediaType: string; filename: string }> = [
                    { type: "text", text: batchPrompt },
                    ...successfulDownloads.map(f => ({
                      type: "file" as const,
                      data: f.dataUrl,
                      mediaType: f.mediaType,
                      filename: f.filename,
                    })),
                  ];

                  logger.debug("📁 [FILE_TOOL] Sending batched analysis request for", successfulDownloads.length, "files");

                  const { text: batchAnalysis } = await generateText({
                    model: google("gemini-2.5-flash"),
                    messages: [{
                      role: "user",
                      content: messageContent,
                    }],
                  });

                  logger.debug("📁 [FILE_TOOL] Successfully analyzed", successfulDownloads.length, "files in batch");
                  fileResults.push(batchAnalysis);
                } catch (analysisError) {
                  logger.error("📁 [FILE_TOOL] Error in batched analysis:", analysisError);
                  fileResults.push(`Error analyzing files: ${analysisError instanceof Error ? analysisError.message : String(analysisError)}`);
                }
              }
            } catch (error) {
              logger.error("📁 [FILE_TOOL] Error in Supabase file processing:", error);
              fileResults.push(`Error processing Supabase files: ${error instanceof Error ? error.message : String(error)}`);
            }
          }

          // LIMITATION: Gemini only supports one video file per request
          // Process the FIRST YouTube URL, report error for extras
          if (youtubeUrls.length > 1) {
            logger.warn("📁 [FILE_TOOL] Gemini supports only one video per request. Processing first, ignoring others.");
            fileResults.push(`⚠️ Note: Only one video can be processed at a time. Processing the first video, others were ignored.`);
          }

          if (youtubeUrls.length > 0) {
            const youtubeUrl = youtubeUrls[0];
            logger.debug("📁 [FILE_TOOL] Processing YouTube URL natively:", youtubeUrl);

            try {
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

              fileResults.push(`**Video: ${youtubeUrl}**\n\n${videoAnalysis}`);
              logger.debug("📁 [FILE_TOOL] Successfully processed YouTube video:", youtubeUrl);
            } catch (videoError) {
              logger.error("📁 [FILE_TOOL] Error processing YouTube video:", {
                url: youtubeUrl,
                error: videoError instanceof Error ? videoError.message : String(videoError),
              });
              fileResults.push(`Error processing video ${youtubeUrl}: ${videoError instanceof Error ? videoError.message : String(videoError)}`);
            }
          }

          // Return combined results
          if (fileResults.length === 0) {
            return "No files were successfully processed";
          }

          return fileResults.join('\n\n---\n\n');
        },
      },

      // TOOL 1: Process URLs (handles web URLs only using Google's URL Context API)

      processUrls: {
        description: "Analyze web pages using Google's URL Context API. Extracts content, key information, and metadata from regular web URLs (http/https). Use this for web pages, articles, documentation, and other web content. For files (PDFs, images, documents) or videos, use the processFiles tool instead.",
        inputSchema: z.object({
          jsonInput: z.string().describe("JSON string containing an object with 'urls' (array of web URLs). Example: '{\"urls\": [\"https://example.com\"]}'"),
        }),
        execute: async ({ jsonInput }: { jsonInput: string }) => {
          let parsed;
          try {
            parsed = JSON.parse(jsonInput);
          } catch (e) {
            logger.error("❌ [URL_TOOL] Failed to parse JSON input:", e);
            return "Error: Input must be a valid JSON string.";
          }

          const urlList = parsed.urls || [];

          logger.debug("🔗 [URL_TOOL] Processing web URLs:", urlList);

          if (!urlList || urlList.length === 0) {
            return "No URLs provided";
          }

          if (urlList.length > 20) {
            return `Too many URLs (${urlList.length}). Maximum 20 URLs allowed.`;
          }

          const fileUrls = urlList.filter((url: string) =>
            url.includes('supabase.co/storage') ||
            url.match(/^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/)
          );

          if (fileUrls.length > 0) {
            logger.warn("🔗 [URL_TOOL] File/video URLs detected, suggesting processFiles tool:", fileUrls);
            return `Error: This tool only handles web URLs. Please use the processFiles tool for file URLs (${fileUrls.join(', ')})`;
          }

          try {
            const tools: any = {
              url_context: google.tools.urlContext({}),
            };

            const promptText = `Analyze the content from the following URL${urlList.length > 1 ? 's' : ''}:
${urlList.map((url: string, i: number) => `${i + 1}. ${url}`).join('\n')}

Please provide:
- What each URL/page is about
- Key information, features, specifications, or data
- Important details relevant to the user's question
- Publication dates or last updated information

Provide a clear, accurate answer based on the URL content.`;

            const { text, sources, providerMetadata } = await generateText({
              model: google("gemini-2.5-flash"),
              tools,
              prompt: promptText,
            });

            const urlMetadata = providerMetadata?.urlContext?.urlMetadata || null;
            const groundingChunks = providerMetadata?.urlContext?.groundingChunks || null;


            return {
              text,
              metadata: {
                urlMetadata: Array.isArray(urlMetadata) ? (urlMetadata as Array<{ retrievedUrl: string; urlRetrievalStatus: string }>) : null,
                groundingChunks: Array.isArray(groundingChunks) ? (groundingChunks as Array<any>) : null,
                sources: Array.isArray(sources) ? (sources as Array<any>) : null,
              },
            };
          } catch (error) {
            logger.error("🔗 [URL_TOOL] Error processing web URLs:", {
              error: error instanceof Error ? error.message : String(error),
              errorType: error instanceof Error ? error.constructor.name : typeof error,
              errorStack: error instanceof Error ? error.stack : undefined,
              urls: urlList,
              fullError: error,
            });
            return {
              text: `Error processing web URLs: ${error instanceof Error ? error.message : String(error)}`,
              metadata: {
                urlMetadata: null,
                groundingChunks: null,
                sources: null,
              },
            };
          }
        },
      },

      // TOOL 2: Delegate to Search Worker

      searchWeb: {
        description: "Search the web for current information, facts, news, or research. Use this when you need up-to-date information from the internet.",
        inputSchema: z.object({
          query: z.string().describe("The search query"),
        }),
        execute: async ({ query }: { query: string }) => {
          return await searchWorker(query);
        },
      },

      // TOOL 2: Delegate to Code Execution Worker
      executeCode: {
        description: "Execute Python code for calculations, data processing, algorithms, or mathematical computations.",
        inputSchema: z.object({
          task: z.string().describe("Description of the task to solve with code"),
        }),
        execute: async ({ task }: { task: string }) => {
          logger.debug("🎯 [ORCHESTRATOR] Delegating to Code Execution Worker:", task);
          return await codeExecutionWorker(task);
        },
      },

      // TOOL 3: Create Note
      createNote: {
        description: "Create a new note card in the current workspace. This tool immediately creates the note card with the provided title and content. Use this to create information, summaries, or content for the user. IMPORTANT: This tool creates the note immediately - it is added to the workspace right away. After calling this tool, you should say something like 'I've created a note for you' or 'I've added a note to your workspace'. You MUST return a JSON object with exactly two fields: 'title' (string) and 'content' (string).\\n\\nTITLE AND CONTENT GUIDELINES:\\n- The 'title' field should be a concise title for the note (e.g., \"Lagrange Multipliers Study Guide\")\\n- The 'content' field should contain ONLY the note body content in markdown format\\n- DO NOT include the title in the content field - the title is stored separately and will be displayed automatically\\n- DO NOT start the content with a markdown header (# Title) - the title is already provided separately\\n- Start the content directly with the body text, lists, tables, etc.\\n- IMPORTANT: Mermaid diagrams/graphs are NOT supported. Do not use mermaid code blocks.\\n\\nMATH FORMATTING GUIDELINES:\\n- Use $$...$$ for inline math within text (e.g., $$E=mc^2$$, $$f(x)$$, $$\\lambda$)\\n- Use $$...$$ for display equations on separate lines (centered, block-level)\\n- IMPORTANT: When using math in lists, tables, or nested structures, ensure the $$ symbols are properly spaced from surrounding text. For example:\\n  - Good: \"The equation $$f(x) = x^2$$ is quadratic\"\\n  - Good: \"- Solve $$\\nabla f = \\lambda \\nabla g$$\"\\n  - Avoid: \"-$$f(x)$$\" (no space before $$) - instead use \"- $$f(x)$$\"\\n- DO NOT add periods, commas, or other punctuation immediately after math expressions. Math expressions should stand alone without trailing punctuation.\\n  - Bad: \"The gradient is $$\\nabla f$$. Then we solve...\"\\n  - Good: \"The gradient is $$\\nabla f$$ Then we solve...\" or \"The gradient is $$\\nabla f$$ and then we solve...\"\\n- For complex equations in lists, consider using display math ($$...$$) on its own line within the list item\\n- Math will be automatically converted to proper rendering format, so use standard LaTeX syntax",
        inputSchema: z.any().describe(
          "A JSON object with 'title' (string) and 'content' (string) fields. The 'title' is the concise title for the note. The 'content' field contains the note body content in markdown format (do not include the title as a header). The markdown may include LaTeX math: use $$...$$ for inline math (with proper spacing) and $$...$$ for display math. Ensure math inside lists and tables has spaces around the $$ symbols. Do not place punctuation immediately after math expressions."
        ),
        execute: async ({ title, content }: { title: string; content: string }) => {
          logger.debug("🎯 [ORCHESTRATOR] Delegating to Workspace Worker (create note):", { title, contentLength: content.length });

          if (!workspaceId) {
            return {
              success: false,
              message: "No workspace context available",
            };
          }

          return await workspaceWorker("create", {
            workspaceId,
            title,
            content,
            folderId: activeFolderId,
          });
        },
      },

      // TOOL 4: Update Card
      updateCard: {
        description: "Update the content of an existing card. This tool COMPLETELY REPLACES the existing content. You must synthesize the FULL new content by combining the existing card content (from your context) with the user's requested changes. Do not just provide the diff; provide the complete new markdown content.",
        inputSchema: z.any().describe(
          "A JSON object with 'id' (string) and 'markdown' (string) or 'content' (string) fields. The 'id' uniquely identifies the note to update. The 'markdown' or 'content' field contains the full note body ONLY (do not include the title as a header). The markdown may include LaTeX math: use $$...$$ for inline math (with proper spacing) and $$...$$ for display math. Ensure math inside lists and tables has spaces around the $$ symbols. Do not place punctuation immediately after math expressions."
        ),
        execute: async (input: any) => {
          logger.group("🎯 [UPDATE-CARD] Tool execution started", true);
          logger.debug("Raw input received:", {
            inputType: typeof input,
            inputKeys: input ? Object.keys(input) : [],
            hasId: !!input?.id,
            hasMarkdown: !!input?.markdown,
            hasContent: !!input?.content,
            idType: typeof input?.id,
            markdownType: typeof input?.markdown,
            contentType: typeof input?.content,
            idValue: input?.id,
            markdownPreview: (input?.markdown || input?.content) ? (typeof (input.markdown || input.content) === 'string' ? (input.markdown || input.content).substring(0, 50) + '...' : String(input.markdown || input.content).substring(0, 50)) : 'undefined',
          });
          logger.groupEnd();

          try {
            // Safely extract parameters with validation
            // Accept both 'markdown' and 'content' as valid parameter names
            const id = input?.id;
            const markdown = input?.markdown ?? input?.content;

            logger.debug("🎯 [UPDATE-CARD] Parameter extraction:", {
              hasId: !!id,
              hasMarkdown: !!input?.markdown,
              hasContent: !!input?.content,
              usingMarkdown: !!input?.markdown,
              usingContent: !input?.markdown && !!input?.content,
            });

            if (!id || typeof id !== 'string') {
              logger.error("❌ [UPDATE-CARD] Invalid or missing id parameter:", { id, idType: typeof id });
              return {
                success: false,
                message: "Card ID is required and must be a string",
              };
            }

            if (markdown === undefined || markdown === null) {
              logger.error("❌ [UPDATE-CARD] Missing markdown/content parameter:", {
                hasMarkdown: !!input?.markdown,
                hasContent: !!input?.content,
                markdownType: typeof input?.markdown,
                contentType: typeof input?.content,
                allInputKeys: input ? Object.keys(input) : [],
              });
              return {
                success: false,
                message: "Markdown content is required (use 'markdown' or 'content' field)",
              };
            }

            if (typeof markdown !== 'string') {
              logger.error("❌ [UPDATE-CARD] Invalid markdown/content type:", {
                markdown,
                markdownType: typeof markdown,
                originalMarkdownType: typeof input?.markdown,
                originalContentType: typeof input?.content,
              });
              return {
                success: false,
                message: "Markdown content must be a string",
              };
            }

            logger.debug("🎯 [UPDATE-CARD] Delegating to Workspace Worker (update):", {
              id,
              contentLength: markdown.length,
              contentPreview: markdown.substring(0, 100) + (markdown.length > 100 ? '...' : ''),
            });

            if (!workspaceId) {
              logger.error("❌ [UPDATE-CARD] No workspace context available");
              return {
                success: false,
                message: "No workspace context available",
              };
            }

            logger.debug("🎯 [UPDATE-CARD] Calling workspaceWorker with params:", {
              action: "update",
              workspaceId,
              itemId: id,
              hasContent: !!markdown,
              contentLength: markdown.length,
            });

            const result = await workspaceWorker("update", {
              workspaceId,
              itemId: id,
              content: markdown,
              // We don't pass title, so it will be preserved
            });

            logger.debug("✅ [UPDATE-CARD] Workspace worker returned:", {
              success: result?.success,
              hasMessage: !!result?.message,
              hasItemId: !!result?.itemId,
            });

            return result;
          } catch (error: any) {
            logger.group("❌ [UPDATE-CARD] Error during execution", false);
            logger.error("Error type:", error?.constructor?.name || typeof error);
            logger.error("Error message:", error?.message || String(error));
            logger.error("Error stack:", error?.stack);
            logger.error("Full error object:", error);
            logger.error("Input that caused error:", input);
            logger.groupEnd();

            return {
              success: false,
              message: `Failed to update card: ${error?.message || String(error)}`,
            };
          }
        },
      },

      // TOOL 5: Clear Card Content
      clearCardContent: {
        description: "Clear/delete the content of a card while preserving its title. Use this when the user wants to delete the contents of a card.",
        inputSchema: z.object({
          id: z.string().describe("The ID of the card to clear"),
        }),
        execute: async ({ id }: { id: string }) => {
          logger.debug("🎯 [ORCHESTRATOR] Delegating to Workspace Worker (clear):", { id });

          if (!workspaceId) {
            return {
              success: false,
              message: "No workspace context available",
            };
          }

          return await workspaceWorker("update", {
            workspaceId,
            itemId: id,
            content: "", // Clear content
            // Title preserved
          });
        },
      },
      // TOOL 6: Delete Card
      deleteCard: {
        description: "Permanently delete a card/note from the workspace. Use this when the user explicitly asks to delete or remove a card.",
        inputSchema: z.object({
          id: z.string().describe("The ID of the card to delete"),
        }),
        execute: async ({ id }: { id: string }) => {
          logger.debug("🎯 [ORCHESTRATOR] Delegating to Workspace Worker (delete):", { id });

          if (!workspaceId) {
            return {
              success: false,
              message: "No workspace context available",
            };
          }

          return await workspaceWorker("delete", {
            workspaceId,
            itemId: id,
          });
        },
      },

      // TOOL 7A: Update Flashcard Deck (add cards to existing deck)
      updateFlashcards: {
        description: `Add more flashcards to an existing flashcard deck. Use this when the user wants to expand an existing deck with additional cards.

IMPORTANT: Use this simple text format:

Deck: [Name of the existing deck to add cards to]

Front: [Question or term for new card 1]
Back: [Answer or definition for new card 1]

Front: [Question or term for new card 2]
Back: [Answer or definition for new card 2]

EXAMPLE:
Deck: Biology Cell Structure

Front: What is the nucleus?
Back: The nucleus is the control center of the cell containing DNA.

Front: What is the cytoplasm?
Back: The cytoplasm is the gel-like substance inside the cell membrane.

The deck name will be matched using fuzzy search. Math is supported: use $$...$$ for inline and $$...$$ for display math.`,
        inputSchema: z.any().describe(
          "Plain text in the format: Deck: [deck name]\\n\\nFront: [question]\\nBack: [answer]\\n\\nFront: [question]\\nBack: [answer]\\n..."
        ),
        execute: async (rawInput: any) => {
          // Parse the input
          let deckName: string | undefined;
          let cardsToAdd: { front: string; back: string }[] = [];

          try {
            // Extract text from various possible input formats
            let text = typeof rawInput === 'string'
              ? rawInput
              : (rawInput?.description || rawInput?.text || rawInput?.content || JSON.stringify(rawInput));

            // Convert escaped newlines to actual newlines
            text = text.replace(/\\n/g, '\n');

            // Extract deck name
            const deckMatch = text.match(/Deck:\s*(.+?)(?:\n|$)/i);
            if (deckMatch) {
              deckName = deckMatch[1].trim();
            }

            // Extract Front/Back pairs
            const cardPattern = /Front:\s*([\s\S]*?)(?=\nBack:)\nBack:\s*([\s\S]*?)(?=\n\nFront:|\n*$)/gi;
            let match;

            while ((match = cardPattern.exec(text)) !== null) {
              const front = match[1].trim();
              const back = match[2].trim();
              if (front && back) {
                cardsToAdd.push({ front, back });
              }
            }

            // Fallback: simpler line-by-line pattern
            if (cardsToAdd.length === 0) {
              const lines = text.split('\n');
              let currentFront: string | null = null;

              for (const line of lines) {
                const frontMatch = line.match(/^Front:\s*(.+)/i);
                const backMatch = line.match(/^Back:\s*(.+)/i);

                if (frontMatch) {
                  currentFront = frontMatch[1].trim();
                } else if (backMatch && currentFront) {
                  cardsToAdd.push({ front: currentFront, back: backMatch[1].trim() });
                  currentFront = null;
                }
              }
            }
          } catch (parseError) {
            logger.error("Error parsing updateFlashcards input:", parseError);
          }

          if (!deckName) {
            return {
              success: false,
              message: "Deck name is required. Use 'Deck: [name]' to specify which deck to update.",
            };
          }

          if (cardsToAdd.length === 0) {
            return {
              success: false,
              message: "No valid cards found. Use 'Front: [question]\\nBack: [answer]' format.",
            };
          }

          if (!workspaceId) {
            return {
              success: false,
              message: "No workspace context available",
            };
          }

          try {
            // Fuzzy match the deck name
            const state = await loadWorkspaceState(workspaceId);
            const searchName = deckName.toLowerCase().trim();

            // Find flashcard decks only
            const flashcardDecks = state.items.filter(item => item.type === 'flashcard');

            // 1. Exact match (case insensitive)
            let matchedDeck = flashcardDecks.find(item => item.name.toLowerCase().trim() === searchName);

            // 2. Contains match (if exact fails)
            if (!matchedDeck) {
              matchedDeck = flashcardDecks.find(item => item.name.toLowerCase().includes(searchName));
            }

            // 3. Reverse contains (deck name contains search term)
            if (!matchedDeck) {
              matchedDeck = flashcardDecks.find(item => searchName.includes(item.name.toLowerCase().trim()));
            }

            if (!matchedDeck) {
              const availableDecks = flashcardDecks.map(d => `"${d.name}"`).join(", ");
              return {
                success: false,
                message: `Could not find flashcard deck "${deckName}". ${availableDecks ? `Available decks: ${availableDecks}` : 'No flashcard decks found in workspace.'}`,
              };
            }

            const workerResult = await workspaceWorker("updateFlashcard", {
              workspaceId,
              itemId: matchedDeck.id,
              itemType: "flashcard",
              flashcardData: {
                cardsToAdd,
              },
            });

            if (workerResult.success) {
              return {
                ...workerResult,
                deckName: matchedDeck.name,
                cardsAdded: cardsToAdd.length,
              };
            }

            return workerResult;
          } catch (error) {
            logger.error("Error updating flashcards:", error);
            return {
              success: false,
              message: `Error updating flashcards: ${error instanceof Error ? error.message : String(error)}`,
            };
          }
        },
      },

      // TOOL 7B: Select Cards into Context
      selectCards: {
        description:
          "Select one or more cards by their TITLES and add them to the conversation context. This tool helps you surface specific cards when the user refers to them. The tool will find the best matching cards for the titles you provide and add them to the system context.",
        inputSchema: z.object({
          cardTitles: z.array(z.string()).describe("Array of card titles to search for and select"),
        }),
        execute: async (input: { cardTitles: string[] }) => {
          const { cardTitles } = input;

          if (!workspaceId) {
            return {
              success: false,
              message: "No workspace context available",
            };
          }

          if (!cardTitles || cardTitles.length === 0) {
            return {
              success: false,
              message: "cardTitles array must be provided and non-empty.",
            };
          }

          try {
            // Verify permission before loading workspace state
            if (!userId) {
              return { success: false, message: "User not authenticated" };
            }

            // Check if user is owner
            const workspace = await db
              .select({ userId: workspaces.userId })
              .from(workspaces)
              .where(eq(workspaces.id, workspaceId))
              .limit(1);

            if (!workspace[0]) {
              return { success: false, message: "Workspace not found" };
            }

            if (workspace[0].userId !== userId) {
              logger.warn(`🔒 [SELECT-CARDS] Access denied for user ${userId} to workspace ${workspaceId}`);
              return {
                success: false,
                message: "Access denied. You do not have permission to view cards in this workspace.",
              };
            }

            const state = await loadWorkspaceState(workspaceId);
            const foundCardIds = new Set<string>();
            const notFoundTitles: string[] = [];

            // Process Titles
            cardTitles.forEach(title => {
              const searchTitle = title.toLowerCase().trim();
              // 1. Exact match (case insensitive)
              let match = state.items.find(item => item.name.toLowerCase().trim() === searchTitle);

              // 2. Contains match (if exact fails)
              if (!match) {
                match = state.items.find(item => item.name.toLowerCase().includes(searchTitle));
              }

              if (match) {
                foundCardIds.add(match.id);
              } else {
                notFoundTitles.push(title);
              }
            });

            const validCardIds = Array.from(foundCardIds);

            if (validCardIds.length === 0) {
              const availableCards = state.items.map(i => `"${i.name}"`).join(", ");
              return {
                success: false,
                message: `No cards found matching your request. ${notFoundTitles.length > 0 ? `Could not find: ${notFoundTitles.join(", ")}. ` : ""}Available cards: ${availableCards}`,
                cardContent: "",
              };
            }

            const selectedCards = state.items.filter((item) =>
              validCardIds.includes(item.id)
            );

            const message = `Selected ${selectedCards.length} card${selectedCards.length === 1 ? "" : "s"}. ${notFoundTitles.length > 0 ? `(Could not find: ${notFoundTitles.join(", ")}) ` : ""}NOTE: This selection was made at the time of this tool call. For the current active selection, checking the 'CARDS IN CONTEXT DRAWER' section in your system context is recommended.`;

            return {
              success: true,
              message,
              selectedCount: selectedCards.length,
              selectedCardNames: selectedCards.map((c) => c.name),
              selectedCardIds: selectedCards.map((c) => c.id),
            };
          } catch (error) {
            logger.error("Error loading cards for selectCards tool:", error);
            return {
              success: false,
              message: `Error selecting cards: ${error instanceof Error ? error.message : "Unknown error"}`,
            };
          }
        },
      },


      // TOOL 8: Create Flashcard Deck
      createFlashcards: {
        description: `Create a new flashcard deck in the workspace. Use this when the user asks to generate flashcards or study materials.

IMPORTANT: Use this simple text format (NOT JSON):

Title: [Your Deck Title]

Front: [Question or term for card 1]
Back: [Answer or definition for card 1]

Front: [Question or term for card 2]
Back: [Answer or definition for card 2]

EXAMPLE:
Title: Biology Cell Structure

Front: What is the function of mitochondria?
Back: Mitochondria are the powerhouses of the cell. They produce ATP through cellular respiration.

Front: Define photosynthesis
Back: Photosynthesis is the process by which plants convert light energy into chemical energy.

Front: What is the cell membrane made of?
Back: The cell membrane is composed of a phospholipid bilayer with embedded proteins.

Math is supported: use $$...$$ for inline and $$...$$ for display math within the Front/Back content.`,
        inputSchema: z.any().describe(
          "Plain text in the format: Title: [title]\\n\\nFront: [question]\\nBack: [answer]\\n\\nFront: [question]\\nBack: [answer]\\n... Use this simple text format, NOT JSON."
        ),
        execute: async (rawInput: any) => {
          logger.group("🎴 [CREATE-FLASHCARDS] Tool execution started", true);
          logger.debug("Raw input received:", {
            rawInputType: typeof rawInput,
            rawInputKeys: rawInput && typeof rawInput === 'object' ? Object.keys(rawInput) : 'N/A',
            rawInputPreview: typeof rawInput === 'string' ? rawInput.substring(0, 200) : JSON.stringify(rawInput).substring(0, 200)
          });

          // Parse the input as text format
          let title: string = "Flashcard Deck";
          let cards: Array<{ front: string; back: string }> = [];

          try {
            // Extract text from various possible input formats
            let text = typeof rawInput === 'string'
              ? rawInput
              : (rawInput?.description || rawInput?.text || rawInput?.content || JSON.stringify(rawInput));

            // Convert escaped newlines to actual newlines
            text = text.replace(/\\n/g, '\n');

            // Extract title
            const titleMatch = text.match(/Title:\s*(.+?)(?:\n|$)/i);
            if (titleMatch) {
              title = titleMatch[1].trim();
            }

            // Extract Front/Back pairs using a pattern that captures content between markers
            const cardPattern = /Front:\s*([\s\S]*?)(?=\nBack:)\nBack:\s*([\s\S]*?)(?=\n\nFront:|\n*$)/gi;
            let match;

            while ((match = cardPattern.exec(text)) !== null) {
              const front = match[1].trim();
              const back = match[2].trim();
              if (front && back) {
                cards.push({ front, back });
              }
            }

            // Fallback: try a simpler line-by-line pattern if the above didn't match
            if (cards.length === 0) {
              const lines = text.split('\n');
              let currentFront: string | null = null;

              for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const frontMatch = line.match(/^Front:\s*(.+)/i);
                const backMatch = line.match(/^Back:\s*(.+)/i);

                if (frontMatch) {
                  currentFront = frontMatch[1].trim();
                } else if (backMatch && currentFront) {
                  cards.push({ front: currentFront, back: backMatch[1].trim() });
                  currentFront = null;
                }
              }
            }

            logger.debug("🎴 [CREATE-FLASHCARDS] Parsed text format:", { title, cardCount: cards.length });
          } catch (parseError) {
            logger.error("❌ [CREATE-FLASHCARDS] Error parsing input:", parseError);
          }

          // Validation
          if (cards.length === 0) {
            logger.error("❌ [CREATE-FLASHCARDS] No valid cards found in input");
            logger.groupEnd();
            return {
              success: false,
              message: "No valid flashcards found. Please use the format: Front: [question]\\nBack: [answer]",
            };
          }

          logger.debug("🎯 [ORCHESTRATOR] Delegating to Workspace Worker (create flashcard):", { title, cardCount: cards.length });

          if (!workspaceId) {
            logger.error("❌ [CREATE-FLASHCARDS] No workspace context available");
            logger.groupEnd();
            return {
              success: false,
              message: "No workspace context available",
            };
          }

          try {
            const result = await workspaceWorker("create", {
              workspaceId,
              title,
              itemType: "flashcard",
              flashcardData: {
                cards
              },
              folderId: activeFolderId,
            });

            logger.debug("✅ [CREATE-FLASHCARDS] Worker result:", result);
            logger.groupEnd();
            return result;
          } catch (error) {
            logger.error("❌ [CREATE-FLASHCARDS] Error executing worker:", error);
            logger.groupEnd();
            throw error;
          }
        },
      },

      // TOOL 9: Deep Research
      deepResearch: {
        description: "Perform deep, multi-step research on a complex topic. Use this when the user explicitly asks for 'deep research' or when a simple web search is insufficient for the depth required. This tool IMMEDIATELY creates a special research card in the workspace that will stream progress and display the final report. You should ask clarifying questions BEFORE calling this tool if the request is vague. Once ready, call this tool with the refined topic/prompt.",
        inputSchema: z.object({
          prompt: z.string().describe("The detailed research topic and instructions."),
        }),
        execute: async ({ prompt }: { prompt: string }) => {
          logger.debug("🎯 [DEEP-RESEARCH] Starting deep research for:", prompt);

          try {
            const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
            if (!apiKey) {
              throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is not set");
            }

            if (!workspaceId) {
              throw new Error("No workspace context available");
            }

            const client = new GoogleGenAI({
              apiKey: apiKey,
            });

            // Start the deep research interaction in background mode with thinking enabled
            const interaction = await client.interactions.create({
              input: prompt,
              agent: "deep-research-pro-preview-12-2025",
              background: true,
              agent_config: {
                type: 'deep-research',
                thinking_summaries: 'auto'
              }
            });

            logger.debug("🎯 [DEEP-RESEARCH] Interaction started:", interaction.id);

            // Create a note with deep research metadata immediately
            const noteResult = await workspaceWorker("create", {
              workspaceId,
              title: `Research: ${prompt.slice(0, 50)}${prompt.length > 50 ? '...' : ''}`,
              deepResearchData: {
                prompt,
                interactionId: interaction.id,
              },
              folderId: activeFolderId,
            });

            logger.debug("🎯 [DEEP-RESEARCH] Research note created:", noteResult.itemId);

            return {
              noteId: noteResult.itemId,
              interactionId: interaction.id,
              message: "Deep research started. Check the new research card in your workspace to see progress.",
            };
          } catch (error: any) {
            logger.error("❌ [DEEP-RESEARCH] Error:", error);
            return {
              error: error?.message || "Failed to start deep research"
            };
          }
        },
      },

      ...clientTools,
    };



    // Replace [URL_CONTEXT:...] markers with clean URL references so agent can see URLs
    const cleanedMessages = convertedMessages.map((message) => {
      if (message.content && Array.isArray(message.content)) {
        const updatedContent = message.content.map((part) => {
          if (part.type === "text" && typeof part.text === "string") {
            // Replace [URL_CONTEXT:...] markers with clean URL references
            const updatedText = part.text.replace(/\[URL_CONTEXT:(.+?)\]/g, (_match: string, url: string) => {
              return url; // Replace marker with just the URL
            });
            return { ...part, text: updatedText };
          }
          return part;
        });
        return { ...message, content: updatedContent } as typeof message;
      }
      return message;
    });

    // Append detection hints for files and URLs
    let finalSystemPrompt = system;

    // Add web search decision-making guidelines
    finalSystemPrompt += `

WEB SEARCH DECISION GUIDELINES:
You have access to the searchWeb tool. Use the following guidelines to decide when to search vs use internal knowledge:

WHEN TO USE INTERNAL KNOWLEDGE (do NOT search):
- Creative Writing: Writing stories, poems, scripts, or creative content
- Coding & Logic: Explaining programming concepts, writing code, or solving math problems
- General Concepts: Explaining historical events, scientific principles, or established theories
- Analysis & Synthesis: Summarizing provided text, changing tone of drafts, or reorganizing content

WHEN TO USE WEB SEARCH:
- Temporal Cues: User mentions "today", "yesterday", "latest", "current", "recent", or specific dates
- Breaking News: Anything that happened after your training cutoff
- Real-Time Data: Sports scores, stock prices, weather, currency exchange rates
- Fact Verification: When asked for specific statistics, citations, or recent studies
- Niche Information: Details about small local businesses, new software versions, or very specific current events

COMBINED APPROACH (search + internal knowledge):
When a query requires both current data AND conceptual explanation, do both:
1. Search for the real-time/factual component
2. Use internal knowledge for the conceptual/explanatory component  
3. Synthesize into a cohesive answer

CONFIDENCE THRESHOLD:
If you are uncertain about a fact's accuracy or currency, prefer to search rather than risk providing outdated information.
`;

    // Add file detection hint if file URLs are present
    if (fileUrls.length > 0) {
      finalSystemPrompt += `\n\nFILE DETECTION: The user's message contains ${fileUrls.length} file(s). You MUST call the processFiles tool with these URLs to analyze them: ${fileUrls.join(', ')}`;
    }

    // Add URL detection hint if URLs are present
    if (urlContextUrls.length > 0) {
      finalSystemPrompt += `\n\nURL DETECTION: The user's message contains ${urlContextUrls.length} URL(s): ${urlContextUrls.join(', ')}. You should call the processUrls tool with these URLs to analyze them.`;
    }



    // Debug: Log final messages before streamText
    logger.debug("🔍 [CHAT-API] Final cleanedMessages before streamText:", {
      count: cleanedMessages.length,
      lastMessage: cleanedMessages[cleanedMessages.length - 1],
      lastMessageKeys: cleanedMessages[cleanedMessages.length - 1] ? Object.keys(cleanedMessages[cleanedMessages.length - 1]) : [],
    });

    const result = streamText({
      model: model,
      system: finalSystemPrompt,
      messages: cleanedMessages,
      stopWhen: stepCountIs(25), // Allow up to 25 steps for tool calls + final response
      tools,
    });

    logger.debug("🔍 [CHAT-API] streamText returned, calling toUIMessageStreamResponse...");
    const response = result.toUIMessageStreamResponse();
    logger.debug("🔍 [CHAT-API] toUIMessageStreamResponse succeeded");
    return response;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Detect timeout errors - Vercel throws specific errors when maxDuration is exceeded
    const isTimeout =
      errorMessage.includes('timeout') ||
      errorMessage.includes('TIMEOUT') ||
      errorMessage.includes('Function execution exceeded') ||
      errorMessage.includes('Execution timeout') ||
      (error && typeof error === 'object' && 'code' in error && error.code === 'TIMEOUT');

    if (isTimeout) {
      logger.error("⏱️ [CHAT-API] Request timed out after 30 seconds", {
        errorMessage,
        workspaceId,
      });

      return new Response(JSON.stringify({
        error: "Request timeout",
        message: "The request took too long to process (exceeded 30 seconds). This can happen with complex queries that require multiple tool calls or extensive processing. Please try breaking your question into smaller parts or simplifying your request.",
        code: "TIMEOUT",
      }), {
        status: 504, // Gateway Timeout
        headers: { "Content-Type": "application/json" },
      });
    }

    // Log other errors
    logger.error("❌ [CHAT-API] Error processing request", {
      errorMessage,
      errorStack: error instanceof Error ? error.stack : undefined,
      workspaceId,
    });

    return new Response(JSON.stringify({
      error: "Internal server error",
      message: "An unexpected error occurred while processing your request. Please try again.",
      details: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
      code: "INTERNAL_ERROR",
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
