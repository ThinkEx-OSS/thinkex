import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

// Serve files from local uploads directory
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path } = await params;
    const filename = path.join('/');
    
    // Security: Prevent directory traversal
    if (filename.includes('..') || filename.includes('/')) {
      // Only allow single filename, not paths
      const safeFilename = filename.split('/').pop() || filename;
      if (safeFilename !== filename) {
        return NextResponse.json(
          { error: "Invalid file path" },
          { status: 400 }
        );
      }
    }

    const uploadsDir = process.env.UPLOADS_DIR || join(process.cwd(), 'uploads');
    const filePath = join(uploadsDir, filename);

    // Check if file exists
    if (!existsSync(filePath)) {
      return NextResponse.json(
        { error: "File not found" },
        { status: 404 }
      );
    }

    // Read and serve file
    const fileBuffer = await readFile(filePath);
    
    // Determine content type from file extension
    const ext = filename.split('.').pop()?.toLowerCase();
    const contentType = getContentType(ext || '');

    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Length': fileBuffer.length.toString(),
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    console.error('Error serving file:', error);
    return NextResponse.json(
      { error: "Failed to serve file" },
      { status: 500 }
    );
  }
}

function getContentType(ext: string): string {
  const contentTypes: Record<string, string> = {
    'pdf': 'application/pdf',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'svg': 'image/svg+xml',
    'txt': 'text/plain',
    'md': 'text/markdown',
    'json': 'application/json',
    'zip': 'application/zip',
    'mp4': 'video/mp4',
    'webm': 'video/webm',
  };
  
  return contentTypes[ext] || 'application/octet-stream';
}
