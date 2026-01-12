import { GoogleGenAI } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";

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
    const searchParams = req.nextUrl.searchParams;
    const interactionId = searchParams.get("interactionId");

    if (!interactionId) {
        return NextResponse.json({ error: "interactionId is required" }, { status: 400 });
    }

    try {
        // Get the interaction without streaming - this returns the current state
        const interaction = await client.interactions.get(interactionId);

        // Extract status from interaction - check multiple possible properties
        const rawStatus = (interaction as any).state?.status || 
                         (interaction as any).status || 
                         "unknown";
        
        // Collect thoughts and report from events or content
        const thoughts: string[] = [];
        let report = "";
        let error: string | undefined = undefined;

        // Try to get content directly first (if API returns full content)
        if ((interaction as any).content) {
            const content = (interaction as any).content;
            if (typeof content === "string") {
                report = content;
            } else if (Array.isArray(content)) {
                // Content might be an array of content blocks
                for (const block of content) {
                    if (block.type === "text" && block.text) {
                        report += block.text;
                    }
                }
            }
        }

        // Process events to extract thoughts and report content
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
            } else if (eventType === "interaction.complete" || eventType === "interaction_complete") {
                // Research completed
            }
        }

        // Also check for thoughts in other possible locations
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
