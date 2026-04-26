import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { join, resolve, sep } from "node:path";
import {
  getPreferredUploadContentType,
  getOfficeDocumentConvertUrl,
} from "@/lib/uploads/office-document-validation";
import {
  getStorageMode,
  getUnsupportedLocalStorageMessage,
} from "@/lib/self-host-config";
import { withServerObservability } from "@/lib/with-server-observability";

export const maxDuration = 30;

function getUploadsDir(): string {
  return resolve(process.env.UPLOADS_DIR || join(process.cwd(), "uploads"));
}

function validateStorageSegment(value: string, label: string): string {
  if (
    !value ||
    value === "." ||
    value === ".." ||
    value.includes("/") ||
    value.includes("\\")
  ) {
    throw new Error(`Invalid ${label}`);
  }

  return value;
}

function isPathInsideDirectory(filePath: string, directory: string): boolean {
  return filePath === directory || filePath.startsWith(`${directory}${sep}`);
}

async function saveFileLocally(
  file: File,
  userId: string,
  filename: string,
): Promise<{ storagePath: string; publicUrl: string }> {
  const uploadsDir = getUploadsDir();
  const ownerId = validateStorageSegment(userId, "user id");
  const safeFilename = validateStorageSegment(filename, "filename");
  const targetDir = resolve(uploadsDir, ownerId);
  const filePath = resolve(targetDir, safeFilename);

  if (!isPathInsideDirectory(targetDir, uploadsDir)) {
    throw new Error("Invalid user storage path");
  }
  if (!isPathInsideDirectory(filePath, uploadsDir)) {
    throw new Error("Invalid file storage path");
  }

  if (!existsSync(targetDir)) {
    await mkdir(targetDir, { recursive: true });
  }

  const bytes = await file.arrayBuffer();
  await writeFile(filePath, Buffer.from(bytes));

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const storagePath = `${ownerId}/${safeFilename}`;
  const publicUrl = `${appUrl}/api/files/${encodeURIComponent(ownerId)}/${encodeURIComponent(safeFilename)}`;
  return { storagePath, publicUrl };
}

export const POST = withServerObservability(async function POST(request: NextRequest) {
  try {
    // Get authenticated user from Better Auth
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }
    const userId = session.user.id;

    // Get file from form data
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    const uploadContentType = getPreferredUploadContentType(
      file.name,
      file.type || "application/octet-stream"
    );

    // Security: Validate against a whitelist of allowed MIME types
    const allowedMimeTypes = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'image/heic',
      'image/heif',
      'image/avif',
      'image/tiff',
      'image/svg+xml',
      'text/plain',
      'text/markdown',
      'application/json',
      'application/zip',
      'video/mp4',
      'video/webm',
      // Allow Office docs briefly so the conversion prompt below works properly
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    ];

    if (!allowedMimeTypes.includes(uploadContentType)) {
      return NextResponse.json(
        { error: `File type ${uploadContentType || 'unknown'} is not allowed. Only safe images, videos, and documents are permitted.` },
        { status: 400 }
      );
    }


    // Reject Office documents — convert to PDF at ilovepdf.com
    const convertUrl = getOfficeDocumentConvertUrl(file);
    const isOfficeUpload = convertUrl !== null;

    // Validate file size (50MB limit)
    const maxSize = 50 * 1024 * 1024; // 50MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: "File size exceeds 50MB limit" },
        { status: 400 }
      );
    }

    // Generate unique filename to avoid conflicts
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    const originalName = file.name;
    // Sanitize filename: remove spaces and special chars, keep only alphanumeric, dots, hyphens, underscores
    const sanitizedName = originalName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storageMode = getStorageMode();
    const filename = storageMode === "supabase" && isOfficeUpload
      ? `uploads/${timestamp}-${random}-${sanitizedName}`
      : `${timestamp}-${random}-${sanitizedName}`;

    if (storageMode === "local") {
      if (isOfficeUpload) {
        return NextResponse.json(
          { error: getUnsupportedLocalStorageMessage("Document conversion") },
          { status: 400 },
        );
      }

      const { publicUrl, storagePath } = await saveFileLocally(file, userId, filename);

      return NextResponse.json({
        success: true,
        url: publicUrl,
        filename: storagePath,
      });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl) {
      console.error("NEXT_PUBLIC_SUPABASE_URL is not configured");
      return NextResponse.json(
        { error: "Server configuration error: Supabase URL not found" },
        { status: 500 },
      );
    }

    if (!serviceRoleKey) {
      console.error("SUPABASE_SERVICE_ROLE_KEY is not configured");
      return NextResponse.json(
        { error: "Server configuration error: Service role key not found" },
        { status: 500 },
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
    const bucketName = "file-upload";

    const { error } = await supabase.storage
      .from(bucketName)
      .upload(filename, file, {
        cacheControl: "3600",
        contentType: uploadContentType,
        upsert: false,
      });

    if (error) {
      console.error("Error uploading file to Supabase:", error);
      return NextResponse.json(
        { error: `Failed to upload file: ${error.message}` },
        { status: 500 },
      );
    }

    const { data: urlData } = supabase.storage
      .from(bucketName)
      .getPublicUrl(filename);

    const publicUrl = urlData.publicUrl;

    return NextResponse.json({
      success: true,
      url: publicUrl,
      filename,
    });
  } catch (error) {
    console.error('Error in upload-file API route:', error);
    return NextResponse.json(
      {
        error: "Failed to upload file",
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}, { routeName: "POST /api/upload-file" });
