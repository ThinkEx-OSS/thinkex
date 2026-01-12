import { NextRequest, NextResponse } from "next/server";
import { extractYouTubeVideoId } from "@/lib/utils/youtube-url";

/**
 * GET /api/youtube/metadata
 * Fetches YouTube video metadata (title) using YouTube oEmbed API
 * 
 * Query params:
 * - url: YouTube video URL
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const url = searchParams.get("url");

    if (!url) {
      return NextResponse.json(
        { error: "URL parameter is required" },
        { status: 400 }
      );
    }

    // Extract video ID to validate URL
    const videoId = extractYouTubeVideoId(url);
    if (!videoId) {
      return NextResponse.json(
        { error: "Invalid YouTube URL" },
        { status: 400 }
      );
    }

    // Use YouTube oEmbed API (no API key required)
    // This endpoint returns video metadata including title
    const oEmbedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;

    const response = await fetch(oEmbedUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0",
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: "Failed to fetch video metadata" },
        { status: response.status }
      );
    }

    const data = await response.json();

    return NextResponse.json({
      title: data.title || "YouTube Video",
      thumbnail: data.thumbnail_url,
    });
  } catch (error) {
    console.error("Error fetching YouTube metadata:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

