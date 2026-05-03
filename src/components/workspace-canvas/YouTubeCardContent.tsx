"use client";

import Image from "next/image";
import { AlertCircle, Play } from "lucide-react";
import type { Item, YouTubeData } from "@/lib/workspace-state/types";
import {
  extractYouTubePlaylistId,
  extractYouTubeVideoId,
  getYouTubeThumbnailUrl,
} from "@/lib/utils/youtube-url";

interface YouTubeCardContentProps {
  item: Item;
}

export function YouTubeCardContent({ item }: YouTubeCardContentProps) {
  const youtubeData = item.data as YouTubeData;
  const videoId = extractYouTubeVideoId(youtubeData.url);
  const playlistId = extractYouTubePlaylistId(youtubeData.url);
  const thumbnailUrl =
    youtubeData.thumbnail || getYouTubeThumbnailUrl(youtubeData.url);
  const hasValidUrl = videoId !== null || playlistId !== null;

  if (!hasValidUrl) {
    return (
      <div className="flex h-full min-h-0 flex-1 flex-col items-center justify-center gap-2 rounded-md px-4 text-center">
        <AlertCircle className="size-5 text-red-700 dark:text-red-300" />
        <p className="text-sm text-red-700 dark:text-red-200">
          Invalid YouTube URL
        </p>
      </div>
    );
  }

  if (!thumbnailUrl) {
    return (
      <div className="flex h-full min-h-0 flex-1 flex-col items-center justify-center gap-2 rounded-md px-4 text-center">
        <div className="flex size-10 items-center justify-center rounded-full bg-red-600 text-white shadow-sm">
          <Play className="ml-0.5 size-5 fill-current" />
        </div>
        <p className="text-sm text-foreground">YouTube</p>
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-0 flex-1 overflow-hidden rounded-md bg-black/10">
      <Image
        src={thumbnailUrl}
        alt={item.name || "YouTube preview"}
        fill
        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
        className="object-cover object-top"
      />
      <div className="absolute inset-0 bg-black/18" />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="flex size-11 items-center justify-center rounded-full bg-red-600/95 text-white shadow-lg">
          <Play className="ml-0.5 size-5 fill-current" />
        </div>
      </div>
    </div>
  );
}

export default YouTubeCardContent;
