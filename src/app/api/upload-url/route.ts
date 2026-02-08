import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 10;

/**
 * Generates a signed upload URL for direct client-to-Supabase uploads.
 * This avoids the Vercel 4.5MB serverless function body size limit.
 * 
 * The client sends only the filename/metadata (tiny JSON payload),
 * receives a signed URL, then uploads the file directly to Supabase.
 */
export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const { filename, contentType } = body;

    if (!filename || typeof filename !== 'string') {
      return NextResponse.json(
        { error: "Filename is required" },
        { status: 400 }
      );
    }

    const storageType = process.env.STORAGE_TYPE || 'supabase';

    if (storageType === 'local') {
      // For local storage, return a flag so the client falls back to /api/upload-file
      return NextResponse.json({
        mode: 'local',
        uploadUrl: '/api/upload-file',
      });
    }

    // Supabase storage: generate a signed upload URL
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl) {
      return NextResponse.json(
        { error: "Server configuration error: Supabase URL not found" },
        { status: 500 }
      );
    }

    if (!serviceRoleKey) {
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

    // Generate unique filename
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    const sanitizedName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `${timestamp}-${random}-${sanitizedName}`;

    // Create a signed upload URL (valid for 5 minutes)
    const { data, error } = await supabase.storage
      .from(bucketName)
      .createSignedUploadUrl(storagePath);

    if (error) {
      console.error('Error creating signed upload URL:', error);
      return NextResponse.json(
        { error: `Failed to create upload URL: ${error.message}` },
        { status: 500 }
      );
    }

    // Get the public URL for after upload completes
    const { data: urlData } = supabase.storage
      .from(bucketName)
      .getPublicUrl(storagePath);

    return NextResponse.json({
      mode: 'supabase',
      signedUrl: data.signedUrl,
      token: data.token,
      path: storagePath,
      publicUrl: urlData.publicUrl,
    });
  } catch (error) {
    console.error('Error in upload-url API route:', error);
    return NextResponse.json(
      {
        error: "Failed to generate upload URL",
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
