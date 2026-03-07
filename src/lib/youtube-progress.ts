const STORAGE_PREFIX = "yt-progress-";

export interface YouTubeProgress {
  progress: number;
  playbackRate?: number;
}

/**
 * Get storage key for YouTube progress.
 * Uses videoId when available; falls back to playlistId for playlist-only URLs.
 */
export function getYouTubeProgressKey(
  videoId: string | null,
  playlistId: string | null
): string | null {
  if (videoId) return `${STORAGE_PREFIX}${videoId}`;
  if (playlistId) return `${STORAGE_PREFIX}pl-${playlistId}`;
  return null;
}

/**
 * Read YouTube progress from localStorage (per-device, per-video).
 */
export function getYouTubeProgress(key: string | null): YouTubeProgress | null {
  if (!key || typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { progress?: number; playbackRate?: number };
    const progress = typeof parsed.progress === "number" ? Math.floor(parsed.progress) : 0;
    if (progress < 0) return null;
    return {
      progress,
      ...(typeof parsed.playbackRate === "number" && parsed.playbackRate > 0 && { playbackRate: parsed.playbackRate }),
    };
  } catch {
    return null;
  }
}

/**
 * Save YouTube progress to localStorage.
 */
export function setYouTubeProgress(
  key: string | null,
  progress: number,
  playbackRate?: number
): void {
  if (!key || typeof window === "undefined") return;
  try {
    const value: YouTubeProgress = {
      progress: Math.floor(progress),
      ...(playbackRate != null && playbackRate > 0 && { playbackRate }),
    };
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // localStorage may be full or disabled
  }
}
