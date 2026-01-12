import { workspaceWorker } from "@/lib/ai/workers";
import { auth } from "@/lib/auth";
import { logger } from "@/lib/utils/logger";
import { headers } from "next/headers";
import { z } from "zod";

const updateFlashcardSchema = z.object({
    workspaceId: z.string().uuid(),
    itemId: z.string().min(1),
    cardsToAdd: z.array(z.object({
        front: z.string(),
        back: z.string()
    })).min(1),
});

export async function POST(req: Request) {
    try {
        const session = await auth.api.getSession({
            headers: await headers(),
        });

        if (!session) {
            return new Response("Unauthorized", { status: 401 });
        }

        const body = await req.json();
        const result = updateFlashcardSchema.safeParse(body);

        if (!result.success) {
            return new Response(JSON.stringify({ error: "Invalid request body", details: result.error }), {
                status: 400,
                headers: { "Content-Type": "application/json" },
            });
        }

        const { workspaceId, itemId, cardsToAdd } = result.data;

        logger.info("🎴 [API] Updating flashcard deck:", { workspaceId, itemId, cardsToAdd: cardsToAdd.length });

        const workerResult = await workspaceWorker("updateFlashcard", {
            workspaceId,
            itemId,
            itemType: "flashcard",
            flashcardData: {
                cardsToAdd
            },
        });

        if (!workerResult.success) {
            return new Response(JSON.stringify({ error: workerResult.message }), {
                status: 500,
                headers: { "Content-Type": "application/json" },
            });
        }

        return new Response(JSON.stringify(workerResult), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });

    } catch (error) {
        logger.error("❌ [API] Error updating flashcard deck:", error);
        return new Response(JSON.stringify({ error: "Internal server error" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
}
