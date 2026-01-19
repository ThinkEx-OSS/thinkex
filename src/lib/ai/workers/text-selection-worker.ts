import { vertex } from "@ai-sdk/google-vertex/edge";
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

        const result = await generateText({
            model: vertex("gemini-2.5-flash"),
            prompt: prompts[action] + (additionalContext ? `\n\nAdditional context: ${additionalContext}` : ""),
        });

        logger.debug("📄 [TEXT-WORKER] Processing completed");
        return result.text;
    } catch (error) {
        logger.error("📄 [TEXT-WORKER] Error:", error);
        throw error;
    }
}
