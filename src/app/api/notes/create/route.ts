import { workspaceWorker } from "@/lib/ai/workers";
import { auth } from "@/lib/auth";
import { logger } from "@/lib/utils/logger";
import { headers } from "next/headers";
import { z } from "zod";

const createNoteSchema = z.object({
    workspaceId: z.string().uuid(),
    title: z.string().min(1),
    content: z.string().optional(),

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
        const result = createNoteSchema.safeParse(body);

        if (!result.success) {
            return new Response(JSON.stringify({ error: "Invalid request body", details: result.error }), {
                status: 400,
                headers: { "Content-Type": "application/json" },
            });
        }

        const { workspaceId, title, content } = result.data;

        logger.info("📝 [API] Creating note via manual confirmation:", { workspaceId, title });

        const workerResult = await workspaceWorker("create", {
            workspaceId,
            title,
            content,

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
        logger.error("❌ [API] Error creating note:", error);
        return new Response(JSON.stringify({ error: "Internal server error" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
}
