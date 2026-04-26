import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { withServerObservability } from "@/lib/with-server-observability";

export const dynamic = "force-dynamic";

const CONTENT_TYPES: Record<string, string> = {
  ".aac": "audio/aac",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".heic": "image/heic",
  ".heif": "image/heif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".json": "application/json",
  ".md": "text/markdown; charset=utf-8",
  ".mp4": "video/mp4",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".wav": "audio/wav",
  ".webm": "video/webm",
  ".webp": "image/webp",
  ".zip": "application/zip",
};

function getContentType(filename: string): string {
  return CONTENT_TYPES[extname(filename).toLowerCase()] ?? "application/octet-stream";
}

function isPathInsideDirectory(filePath: string, directory: string): boolean {
  return filePath === directory || filePath.startsWith(`${directory}${sep}`);
}

function getDownloadHeaders(relativePath: string): Headers {
  const contentType = getContentType(relativePath);
  const headers = new Headers({
    "Cache-Control": "private, max-age=0, must-revalidate",
    "Content-Type": contentType,
    "X-Content-Type-Options": "nosniff",
  });

  if (contentType === "image/svg+xml") {
    const filename = relativePath.split("/").at(-1) ?? "download.svg";
    headers.set("Content-Disposition", `attachment; filename="${filename}"`);
  }

  return headers;
}

async function handleGET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { path } = await params;
  if (path.length !== 2) {
    return NextResponse.json({ error: "Invalid file path" }, { status: 400 });
  }

  const [ownerId] = path;
  const relativePath = path.join("/");
  if (
    !relativePath ||
    path.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    return NextResponse.json({ error: "Invalid file path" }, { status: 400 });
  }

  if (ownerId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const uploadsDir = resolve(process.env.UPLOADS_DIR || join(process.cwd(), "uploads"));
  const filePath = resolve(uploadsDir, relativePath);
  if (!isPathInsideDirectory(filePath, uploadsDir)) {
    return NextResponse.json({ error: "Invalid file path" }, { status: 400 });
  }

  if (!existsSync(filePath)) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const file = await readFile(filePath);
  return new NextResponse(file, {
    headers: getDownloadHeaders(relativePath),
  });
}

export const GET = withServerObservability(handleGET, {
  routeName: "GET /api/files/[...path]",
});
