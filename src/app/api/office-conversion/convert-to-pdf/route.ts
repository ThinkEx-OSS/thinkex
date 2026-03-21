import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { getFastAPIClient } from "@/lib/fastapi-client";

/** Matches paths from upload-url / upload-file (optional `uploads/` for office docs). */
const STORAGE_PATH_PATTERN = /^(uploads\/)?\d+-[a-z0-9]+-[A-Za-z0-9._-]+$/;
const MAX_FILE_PATH_LEN = 512;
const MAX_FILE_URL_LEN = 4096;

function isValidStoragePath(filePath: string): boolean {
  return STORAGE_PATH_PATTERN.test(filePath);
}

function isValidLocalFileUrl(fileUrl: string, filePath: string, requestOrigin: string): boolean {
  const expectedUrl = new URL(`/api/files/${filePath}`, requestOrigin);
  return fileUrl === expectedUrl.toString();
}

function isValidSupabaseFileUrl(fileUrl: string, filePath: string): boolean {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!supabaseUrl) {
    return false;
  }

  const expectedUrl = new URL(
    `/storage/v1/object/public/file-upload/${filePath}`,
    supabaseUrl
  );
  return fileUrl === expectedUrl.toString();
}

function isValidConversionRequest(
  filePath: string,
  fileUrl: string,
  requestOrigin: string
): boolean {
  if (!isValidStoragePath(filePath)) {
    return false;
  }

  return (
    isValidLocalFileUrl(fileUrl, filePath, requestOrigin) ||
    isValidSupabaseFileUrl(fileUrl, filePath)
  );
}

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

    if (
      file_path.length > MAX_FILE_PATH_LEN ||
      file_url.length > MAX_FILE_URL_LEN
    ) {
      return NextResponse.json(
        { error: "Invalid conversion source" },
        { status: 400 }
      );
    }

    // SSRF: only our public file URLs (same origin or Supabase bucket) with a strict path shape
    if (!isValidConversionRequest(file_path, file_url, request.nextUrl.origin)) {
      return NextResponse.json(
        { error: "Invalid conversion source" },
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
        { error },
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
