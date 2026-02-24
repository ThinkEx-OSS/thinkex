import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { chatThreads } from "@/lib/db/schema";
import {
  requireAuth,
  verifyWorkspaceAccess,
} from "@/lib/api/workspace-helpers";
import { eq, and, desc } from "drizzle-orm";

/**
 * GET /api/threads?workspaceId=xxx
 * List threads for a workspace
 */
export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth();
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("workspaceId");

    if (!workspaceId) {
      return NextResponse.json(
        { error: "workspaceId is required" },
        { status: 400 }
      );
    }

    await verifyWorkspaceAccess(workspaceId, userId);

    const threads = await db
      .select({
        id: chatThreads.id,
        title: chatThreads.title,
        isArchived: chatThreads.isArchived,
        externalId: chatThreads.externalId,
      })
      .from(chatThreads)
      .where(eq(chatThreads.workspaceId, workspaceId))
      .orderBy(desc(chatThreads.lastMessageAt));

    return NextResponse.json({
      threads: threads.map((t) => ({
        remoteId: t.id,
        status: t.isArchived ? "archived" : "regular",
        title: t.title ?? undefined,
        externalId: t.externalId ?? undefined,
      })),
    });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[threads] GET error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/threads
 * Create a new thread
 */
export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuth();
    const body = await req.json().catch(() => ({}));
    const { workspaceId, localId, externalId } = body;

    if (!workspaceId) {
      return NextResponse.json(
        { error: "workspaceId is required" },
        { status: 400 }
      );
    }

    await verifyWorkspaceAccess(workspaceId, userId, "editor");

    const [inserted] = await db
      .insert(chatThreads)
      .values({
        workspaceId,
        userId,
        externalId: externalId ?? undefined,
      })
      .returning({ id: chatThreads.id, externalId: chatThreads.externalId });

    if (!inserted) {
      return NextResponse.json(
        { error: "Failed to create thread" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      id: inserted.id,
      remoteId: inserted.id,
      externalId: inserted.externalId ?? undefined,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[threads] POST error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
