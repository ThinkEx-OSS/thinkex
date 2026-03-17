/**
 * POST /api/upload
 *
 * Extension file upload endpoint. Accepts multipart/form-data with Bearer token.
 * Used by Chrome extension to upload Canvas files (PDFs, etc.) to ThinkEx.
 *
 * Headers: Authorization: Bearer {access_token}
 * Body: multipart/form-data, field "file" (required), optional "filename"
 * Response: { id, url }
 */
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";
import { randomBytes } from "crypto";
import { getOfficeDocumentConvertUrl } from "@/lib/uploads/office-document-validation";

export const maxDuration = 30;

const MAX_SIZE = 50 * 1024 * 1024; // 50MB

const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "image/avif",
  "image/tiff",
  "image/svg+xml",
  "text/plain",
  "text/markdown",
  "application/json",
  "application/zip",
  "video/mp4",
  "video/webm",
];

const getStorageType = (): "supabase" | "local" => {
  const t = process.env.STORAGE_TYPE || "supabase";
  return t === "local" ? "local" : "supabase";
};

function generatePublicId(): string {
  return randomBytes(8).toString("base64url");
}

async function saveFileLocally(
  file: File,
  storagePath: string
): Promise<void> {
  const uploadsDir = process.env.UPLOADS_DIR || join(process.cwd(), "uploads");
  if (!existsSync(uploadsDir)) {
    await mkdir(uploadsDir, { recursive: true });
  }
  const filePath = join(uploadsDir, storagePath);
  const bytes = await file.arrayBuffer();
  await writeFile(filePath, Buffer.from(bytes));
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    if (!ALLOWED_MIME_TYPES.includes(file.type || "")) {
      return NextResponse.json(
        { error: "Unsupported file type" },
        { status: 415 }
      );
    }

    const convertUrl = getOfficeDocumentConvertUrl(file);
    if (convertUrl) {
      return NextResponse.json(
        { error: "Word, Excel, and PowerPoint files are not supported. Convert to PDF first." },
        { status: 415 }
      );
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: "File too large", maxSize: MAX_SIZE },
        { status: 413 }
      );
    }

    const publicId = generatePublicId();
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    const sanitizedName = (file.name || "file").replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `ext-${timestamp}-${random}-${sanitizedName}`;
    const storageType = getStorageType();
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const viewUrl = `${baseUrl}/view/${publicId}`;

    if (storageType === "local") {
      await saveFileLocally(file, storagePath);
    } else {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

      if (!supabaseUrl || !serviceRoleKey) {
        return NextResponse.json(
          { error: "Upload failed" },
          { status: 500 }
        );
      }

      const supabase = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      const { error } = await supabase.storage
        .from("file-upload")
        .upload(storagePath, file, { cacheControl: "3600", upsert: false });

      if (error) {
        console.error("Extension upload to Supabase failed:", error);
        return NextResponse.json(
          { error: "Upload failed" },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      id: publicId,
      url: viewUrl,
    });
  } catch (err) {
    console.error("Extension upload error:", err);
    return NextResponse.json(
      { error: "Upload failed" },
      { status: 500 }
    );
  }
}
