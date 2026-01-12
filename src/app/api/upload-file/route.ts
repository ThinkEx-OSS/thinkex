import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 30;

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

    // Accept all file types (removed image-only restriction)
    // File type validation can be done client-side if needed

    // Validate file size (10MB limit)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: "File size exceeds 10MB limit" },
        { status: 400 }
      );
    }

    // Create Supabase client with service role for server-side uploads
    // This bypasses RLS since we've already verified Better Auth
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

    // Generate unique filename to avoid conflicts
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    const originalName = file.name;
    const filename = `${timestamp}-${random}-${originalName}`;

    // Upload file to Supabase storage
    const { data, error } = await supabase.storage
      .from(bucketName)
      .upload(filename, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (error) {
      console.error('Error uploading file to Supabase:', error);
      return NextResponse.json(
        { error: `Failed to upload file: ${error.message}` },
        { status: 500 }
      );
    }

    // Get public URL using Supabase's getPublicUrl method
    const { data: urlData } = supabase.storage
      .from(bucketName)
      .getPublicUrl(filename);

    return NextResponse.json({
      success: true,
      url: urlData.publicUrl,
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
}

