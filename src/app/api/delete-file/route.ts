import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { unlink } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

// Storage type: 'supabase' | 'local'
const getStorageType = (): 'supabase' | 'local' => {
  const storageType = process.env.STORAGE_TYPE || 'supabase';
  return storageType === 'local' ? 'local' : 'supabase';
};

  // Extract filename from various URL formats
function extractFilename(url: string): string | null {
  // Supabase format: https://xxx.supabase.co/storage/v1/object/public/file-upload/filename
  const supabaseMatch = url.match(/\/file-upload\/(.+)$/);
  if (supabaseMatch) {
    return supabaseMatch[1];
  }
  
  // Local format: http://localhost:3000/api/files/filename
  const localMatch = url.match(/\/api\/files\/(.+)$/);
  if (localMatch) {
    return localMatch[1];
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

    // Security: Prevent directory traversal
    if (filename.includes('..') || filename.includes('/')) {
      return NextResponse.json(
        { error: "Invalid filename" },
        { status: 400 }
      );
    }

    const storageType = getStorageType();

    if (storageType === 'local') {
      // Delete from local file system
      const uploadsDir = process.env.UPLOADS_DIR || join(process.cwd(), 'uploads');
      const filePath = join(uploadsDir, filename);

      if (!existsSync(filePath)) {
        return NextResponse.json({
          success: true,
          message: 'File not found (may have been deleted already)',
        });
      }

      try {
        await unlink(filePath);
        return NextResponse.json({
          success: true,
          message: 'File deleted successfully',
        });
      } catch (error) {
        console.error('Error deleting local file:', error);
        return NextResponse.json(
          { error: `Failed to delete file: ${error instanceof Error ? error.message : String(error)}` },
          { status: 500 }
        );
      }
    } else {
      // Default: Supabase storage
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

      if (!supabaseUrl) {
        console.error('NEXT_PUBLIC_SUPABASE_URL is not configured');
        return NextResponse.json(
          { error: "Server configuration error: Supabase URL not found" },
          { status: 500 }
        );
      }

      if (!serviceRoleKey) {
        console.error('SUPABASE_SERVICE_ROLE_KEY is not configured');
        return NextResponse.json(
          { error: "Server configuration error: Service role key not found" },
          { status: 500 }
        );
      }

      const supabase = createClient(supabaseUrl, serviceRoleKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      });
      const bucketName = 'file-upload';

      // Delete file from Supabase storage
      const { error } = await supabase.storage
        .from(bucketName)
        .remove([filename]);

      if (error) {
        console.error('Error deleting file from Supabase:', error);
        // Don't fail if file doesn't exist (might have been deleted already)
        if (error.message.includes('not found') || error.message.includes('404')) {
          return NextResponse.json({
            success: true,
            message: 'File not found (may have been deleted already)',
          });
        }
        return NextResponse.json(
          { error: `Failed to delete file: ${error.message}` },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        message: 'File deleted successfully',
      });
    }
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
