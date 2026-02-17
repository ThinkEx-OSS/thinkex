import { google } from "@ai-sdk/google";
import { generateText } from "ai";
import { logger } from "@/lib/utils/logger";

/**
 * WORKER 4: Text Selection Agent
 * Processes and transforms selected text (summarize, explain, rewrite, etc.)
 */
export async function textSelectionWorker(
    action: "summarize" | "explain" | "rewrite" | "translate" | "improve",
    text: string,
    additionalContext?: string
): Promise<string> {
    try {
        logger.debug("📄 [TEXT-WORKER] Action:", action);

        const prompts = {
            summarize: `Summarize the following text concisely:\n\n${text}`,
            explain: `Explain the following text in simple terms:\n\n${text}`,
            rewrite: `Rewrite the following text to be clearer and more concise:\n\n${text}`,
            translate: `Translate the following text to ${additionalContext || "English"}:\n\n${text}`,
            improve: `Improve the following text for grammar, clarity, and style:\n\n${text}`,
        };

        const systemInstruction = `You transform selected text as requested. Return ONLY the transformed text—no preamble, labels, or meta-commentary. Be concise: summarize in 1-3 sentences; explain in 2-5 sentences; rewrite/improve to similar length; translate preserves length.`;

        const result = await generateText({
            model: google("gemini-2.5-flash"),
            system: systemInstruction,
            prompt: prompts[action] + (additionalContext ? `\n\nAdditional context: ${additionalContext}` : ""),
        });

        logger.debug("📄 [TEXT-WORKER] Processing completed");
        return result.text;
    } catch (error) {
        logger.error("📄 [TEXT-WORKER] Error:", error);
        throw error;
    }
}

