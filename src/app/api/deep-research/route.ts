
import { GoogleGenAI } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";

// Initialize client (verify API key availability)
const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
if (!apiKey) {
    console.error("GOOGLE_GENERATIVE_AI_API_KEY is not set");
}

const client = new GoogleGenAI({
    apiKey: apiKey,
});

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { prompt } = body;

        if (!prompt) {
            return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
        }

        // Start the deep research interaction in background mode
        const interaction = await client.interactions.create({
            input: prompt,
            agent: "deep-research-pro-preview-12-2025",
            background: true,
            // Enable thinking summaries to get "thought" events
            agent_config: {
                type: 'deep-research',
                thinking_summaries: 'auto'
            }
        });

        return NextResponse.json({
            interactionId: interaction.id,
            status: "started",
        });
    } catch (error: any) {
        console.error("[DEEP_RESEARCH] Create Error:", error);
        return NextResponse.json(
            { error: error?.message || "Failed to start deep research" },
            { status: 500 }
        );
    }
}
