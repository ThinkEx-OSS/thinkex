import { google } from "@ai-sdk/google";
import { generateText } from "ai";
import { auth } from "@/lib/auth";
import { workspaceWorker } from "@/lib/ai/workers";
import { logger } from "@/lib/utils/logger";
import { headers } from "next/headers";
import { z } from "zod";

const createFromUrlsSchema = z.object({
    urls: z.array(z.string().url()).min(1).max(10),
    workspaceId: z.string().uuid(),
    folderId: z.string().uuid().optional(),
});


export async function POST(req: Request) {
    try {
        const session = await auth.api.getSession({
            headers: await headers(),
        });

        if (!session) {
            return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
        }

        const body = await req.json();
        const parseResult = createFromUrlsSchema.safeParse(body);

        if (!parseResult.success) {
            return new Response(JSON.stringify({ error: "Invalid request body", details: parseResult.error.flatten() }), {
                status: 400,
                headers: { "Content-Type": "application/json" },
            });
        }

        const { urls, workspaceId, folderId } = parseResult.data;

        logger.info("📝 [API] Creating note from URLs:", { workspaceId, urlCount: urls.length });

        // Use Google's URL Context API to analyze the content
        const tools: any = {
            url_context: google.tools.urlContext({}),
        };

        const promptText = `Analyze the content from the following website URL(s) and create a comprehensive study note.

URLs to analyze:
${urls.map((url, i) => `${i + 1}. ${url}`).join('\n')}

Provide your response in this exact format with clear delimiters:

===TITLE===
[Your clear, informative title here]

===CONTENT===
[Your detailed markdown content here with proper headings, bullet points, etc.]

===SOURCES===
[One source per line in format: Title | URL]

Make sure to:
- Generate a clear title that captures the main topic
- Create comprehensive markdown content synthesizing key information from all pages
- Use proper markdown formatting (headings, bullet points, etc.)
- Include all URLs in the sources section with their actual page titles`;

        const { text } = await generateText({
            model: google("gemini-2.5-flash"),
            tools,
            prompt: promptText,
        });

        logger.debug("📝 [API] LLM response received:", { textLength: text?.length });

        // Parse the delimited response
        let title = "Website Summary";
        let content = "";
        let sources: Array<{ title: string; url: string }> = [];

        try {
            const titleMatch = text.match(/===TITLE===\s*\n([\s\S]*?)(?:\n|$)/);
            if (titleMatch) {
                title = titleMatch[1].trim();
            }

            const contentMatch = text.match(/===CONTENT===\s*\n([\s\S]*?)\n\n===/);
            if (contentMatch) {
                content = contentMatch[1].trim();
            }

            const sourcesMatch = text.match(/===SOURCES===\s*\n([\s\S]*?)(?:\n\n|$)/);
            if (sourcesMatch) {
                const sourcesText = sourcesMatch[1].trim();
                const sourceLines = sourcesText.split('\n').filter((line: string) => line.trim());
                sources = sourceLines.map((line: string) => {
                    const parts = line.split('|').map((p: string) => p.trim());
                    if (parts.length >= 2) {
                        return { title: parts[0], url: parts[1] };
                    }
                    // Fallback if format is different
                    return null;
                }).filter((s: { title: string; url: string } | null): s is { title: string; url: string } => s !== null);
            }
        } catch (parseError) {
            logger.error("📝 [API] Failed to parse delimited response:", parseError);
            content = text || "Failed to generate content from the provided URLs.";
        }

        // Ensure sources are populated with the original URLs if missing
        if (sources.length === 0) {
            sources = urls.map(url => {
                try {
                    const hostname = new URL(url).hostname;
                    return { title: hostname, url };
                } catch {
                    return { title: url, url };
                }
            });
        }

        // Create the note using workspace worker
        const workerResult = await workspaceWorker("create", {
            workspaceId,
            title,
            content,
            sources,
            folderId,
        });

        if (!workerResult.success) {
            return new Response(JSON.stringify({ error: workerResult.message }), {
                status: 500,
                headers: { "Content-Type": "application/json" },
            });
        }

        logger.info("📝 [API] Note created from URLs successfully:", { itemId: workerResult.itemId });

        return new Response(JSON.stringify(workerResult), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });

    } catch (error) {
        logger.error("❌ [API] Error creating note from URLs:", error);
        return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Internal server error" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
}
