import { NextRequest, NextResponse } from "next/server";
import { setThreadArchived } from "@/lib/api/thread-archive";

/**
 * POST /api/threads/[id]/archive
 * Archive a thread
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    return await setThreadArchived(id, true);
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[threads] archive error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
