import { GoogleGenAI } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/utils/logger";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

// Initialize client
const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
if (!apiKey) {
    console.error("GOOGLE_GENERATIVE_AI_API_KEY is not set");
}
const client = new GoogleGenAI({
    apiKey: apiKey,
});
export const dynamic = 'force-dynamic';
/**
 * GET /api/deep-research/status
 * Poll endpoint to check the status of a deep research interaction
 * Returns current state: status, thoughts, report content, and any errors
 */
export async function GET(req: NextRequest) {
    try {
        const session = await auth.api.getSession({
            headers: await headers(),
        });

        if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const searchParams = req.nextUrl.searchParams;
        const interactionId = searchParams.get("interactionId");
        if (!interactionId) {
            return NextResponse.json({ error: "interactionId is required" }, { status: 400 });
        }

        // Get the interaction without streaming - this returns the current state
        const interaction = await client.interactions.get(interactionId);
        // DEBUG: Log the entire raw interaction object (optional, kept minimal)
        logger.debug('[DEEP-RESEARCH-STATUS] ========== RAW INTERACTION PAYLOAD ==========');
        logger.debug('[DEEP-RESEARCH-STATUS] Interaction ID:', interactionId);
        logger.debug('[DEEP-RESEARCH-STATUS] State object:', (interaction as any).state);
        logger.debug('[DEEP-RESEARCH-STATUS] Status field:', (interaction as any).status);
        // Extract status from interaction - check multiple possible properties
        const rawStatus = (interaction as any).state?.status ||
            (interaction as any).status ||
            "unknown";
        // Collect thoughts and report from events or content
        const thoughts: string[] = [];
        let report = "";
        let error: string | undefined = undefined;
        // PRIMARY: Extract from outputs array (this is where the API actually returns data)
        const outputs = (interaction as any).outputs || [];
        for (const output of outputs) {
            if (output.type === "text" && output.text) {
                // This is the final report
                report = output.text;
            } else if (output.type === "thought" && output.summary) {
                // This contains the thought summaries
                for (const thought of output.summary) {
                    if (thought.text && typeof thought.text === "string" && !thoughts.includes(thought.text)) {
                        thoughts.push(thought.text);
                    }
                }
            }
        }
        // FALLBACK: Try to get content directly (legacy format)
        if (!report && (interaction as any).content) {
            const content = (interaction as any).content;
            if (typeof content === "string") {
                report = content;
            } else if (Array.isArray(content)) {
                for (const block of content) {
                    if (block.type === "text" && block.text) {
                        report += block.text;
                    }
                }
            }
        }
        // FALLBACK: Process events to extract thoughts and report content (legacy format)
        const events = (interaction as any).events || [];
        for (const event of events) {
            const eventType = event.event_type || event.type;
            if (eventType === "content.delta") {
                const delta = event.delta || {};
                if (delta.type === "text" && delta.text) {
                    report += delta.text;
                } else if (delta.type === "thought_summary") {
                    const thoughtText = delta.content?.text || delta.text;
                    if (thoughtText && typeof thoughtText === "string" && !thoughts.includes(thoughtText)) {
                        thoughts.push(thoughtText);
                    }
                }
            } else if (eventType === "interaction.failed" || eventType === "interaction_failed") {
                error = event.error?.message || event.error || "Research failed";
            }
        }
        // FALLBACK: Also check for thoughts in other possible locations
        if ((interaction as any).thoughts && Array.isArray((interaction as any).thoughts)) {
            for (const thought of (interaction as any).thoughts) {
                const thoughtText = typeof thought === "string" ? thought : thought?.text || thought?.content;
                if (thoughtText && !thoughts.includes(thoughtText)) {
                    thoughts.push(thoughtText);
                }
            }
        }
        // Map Google's status to our status format
        let mappedStatus: "researching" | "complete" | "failed" = "researching";
        const statusLower = String(rawStatus).toLowerCase();
        if (statusLower === "complete" || statusLower === "completed" || statusLower === "done") {
            mappedStatus = "complete";
        } else if (statusLower === "failed" || statusLower === "error" || error) {
            mappedStatus = "failed";
        }
        return NextResponse.json({
            status: mappedStatus,
            thoughts,
            report,
            error,
        });
    } catch (error: any) {
        console.error("[DEEP_RESEARCH_STATUS] Error:", error);
        return NextResponse.json(
            {
                error: error?.message || "Failed to retrieve interaction status",
                status: "failed" as const,
            },
            { status: 500 }
        );
    }
}
