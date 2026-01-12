import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { workspaceWorker } from "@/lib/ai/workers";
import { logger } from "@/lib/utils/logger";

/**
 * POST /api/deep-research/finalize
 * Called when deep research completes to format the report and update the note card.
 * Uses workspaceWorker("update", ...) which handles markdownToBlocks conversion
 * just like the updateCard tool does.
 */
export async function POST(req: NextRequest) {
    try {
        const session = await auth.api.getSession({
            headers: await headers(),
        });

        if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const { itemId, report, thoughts, workspaceId } = body;

        if (!itemId || !report) {
            return NextResponse.json(
                { error: "itemId and report are required" },
                { status: 400 }
            );
        }

        if (!workspaceId) {
            return NextResponse.json(
                { error: "workspaceId is required" },
                { status: 400 }
            );
        }

        logger.debug("[DEEP-RESEARCH-FINALIZE] Processing:", { itemId, reportLength: report.length });

        // Use workspaceWorker update action - this handles:
        // 1. markdownToBlocks conversion (same as createNote/updateCard tools)
        // 2. Storing field1 (raw markdown) and blockContent (formatted blocks)
        // 3. Event emission for real-time sync
        const result = await workspaceWorker("update", {
            workspaceId,
            itemId,
            content: report, // This will be converted via markdownToBlocks
        });

        if (!result.success) {
            logger.error("[DEEP-RESEARCH-FINALIZE] Worker update failed:", result.message);
            return NextResponse.json(
                { error: result.message || "Failed to update note" },
                { status: 500 }
            );
        }

        logger.debug("[DEEP-RESEARCH-FINALIZE] Note content updated via workspaceWorker");

        // TODO: If we need to also update the deepResearch.status to "complete",
        // we'd need to extend workspaceWorker or emit a second event.
        // For now, the component handles status update locally.

        return NextResponse.json({
            success: true,
            message: "Research finalized and saved to note",
        });
    } catch (error: any) {
        logger.error("[DEEP-RESEARCH-FINALIZE] Error:", error);
        return NextResponse.json(
            { error: error?.message || "Failed to finalize research" },
            { status: 500 }
        );
    }
}
