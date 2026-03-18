import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { getFastAPIClient } from "@/lib/fastapi-client";

/**
 * Proxies document-to-PDF conversion to the FastAPI backend.
 * Payload: { file_path: "uploads/...", file_url: publicUrl } — no ?download=, no bucket in path.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { file_path, file_url } = body as { file_path?: string; file_url?: string };

    if (!file_path || typeof file_path !== "string") {
      return NextResponse.json(
        { error: "file_path is required" },
        { status: 400 }
      );
    }

    if (!file_url || typeof file_url !== "string") {
      return NextResponse.json(
        { error: "file_url is required" },
        { status: 400 }
      );
    }

    // Pass URL as-is; ?download= can cause Supabase to return invalid Content-Disposition
    const fastapi = getFastAPIClient();
    const { data, error } = await fastapi.post<{
      pdf_url?: string;
      pdf_path?: string;
    }>("api/v1/conversions/document-to-pdf", {
      file_path,
      file_url,
    });

    if (error) {
      return NextResponse.json(
        { error: error || "Conversion failed" },
        { status: 502 }
      );
    }

    return NextResponse.json(data ?? {});
  } catch (err) {
    console.error("[convert-to-pdf] Error:", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Conversion failed",
      },
      { status: 500 }
    );
  }
}
