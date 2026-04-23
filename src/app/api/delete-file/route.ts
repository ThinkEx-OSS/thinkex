import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

// Extract object path from a Supabase public file URL
function extractFilename(url: string): string | null {
  const supabaseMatch = url.match(/\/file-upload\/(.+)$/);
  if (supabaseMatch) {
    return supabaseMatch[1];
  }
  return null;
}

export async function DELETE(request: NextRequest) {
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

    // Get filename from query params or body
    const { searchParams } = new URL(request.url);
    let filename = searchParams.get('filename');
    const url = searchParams.get('url');

    // Extract filename from URL if URL is provided
    if (!filename && url) {
      filename = extractFilename(url);
    }

    if (!filename) {
      return NextResponse.json(
        { error: "Filename or URL is required" },
        { status: 400 }
      );
    }

    if (filename.includes("..")) {
      return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
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
      .remove([filename]);

    if (error) {
      console.error("Error deleting file from Supabase:", error);
      if (error.message.includes("not found") || error.message.includes("404")) {
        return NextResponse.json({
          success: true,
          message: "File not found (may have been deleted already)",
        });
      }
      return NextResponse.json(
        { error: `Failed to delete file: ${error.message}` },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      message: "File deleted successfully",
    });
  } catch (error) {
    console.error('Error in delete-file API route:', error);
    return NextResponse.json(
      {
        error: "Failed to delete file",
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
