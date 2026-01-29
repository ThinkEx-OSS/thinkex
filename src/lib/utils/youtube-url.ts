/**
 * YouTube URL utility functions
 */

/**
 * Extract YouTube video ID from various URL formats
 * Handles formats like:
 * - https://www.youtube.com/watch?v=VIDEO_ID
 * - https://youtu.be/VIDEO_ID
 * - https://www.youtube.com/embed/VIDEO_ID
 * - https://youtube.com/embed/VIDEO_ID
 */
export function extractYouTubeVideoId(url: string): string | null {
  if (!url || typeof url !== 'string') {
    return null;
  }

  try {
    const urlObj = new URL(url);

    // Handle youtu.be short links
    if (urlObj.hostname === 'youtu.be') {
      const videoId = urlObj.pathname.slice(1); // Remove leading slash
      return videoId || null;
    }

    // Handle youtube.com URLs with an explicit hostname whitelist
    const allowedYouTubeHosts = new Set<string>([
      'youtube.com',
      'www.youtube.com',
      'm.youtube.com',
    ]);

    if (allowedYouTubeHosts.has(urlObj.hostname)) {
      // Watch URLs: /watch?v=VIDEO_ID
      if (urlObj.pathname === '/watch') {
        return urlObj.searchParams.get('v');
      }

      // Embed URLs: /embed/VIDEO_ID
      if (urlObj.pathname.startsWith('/embed/')) {
        const videoId = urlObj.pathname.split('/embed/')[1];
        return videoId || null;
      }
    }

    return null;
  } catch (error) {
    // Invalid URL
    return null;
  }
}

/**
 * Extract YouTube playlist ID from various URL formats
 * Handles formats like:
 * - https://www.youtube.com/playlist?list=PLAYLIST_ID
 * - https://www.youtube.com/watch?v=VIDEO_ID&list=PLAYLIST_ID
 */
export function extractYouTubePlaylistId(url: string): string | null {
  if (!url || typeof url !== 'string') {
    return null;
  }

  try {
    const urlObj = new URL(url);

    // Handle youtube.com URLs with an explicit hostname whitelist
    const allowedYouTubeHosts = new Set<string>([
      'youtube.com',
      'www.youtube.com',
      'm.youtube.com',
    ]);

    if (allowedYouTubeHosts.has(urlObj.hostname)) {
      // Check for list parameter
      const playlistId = urlObj.searchParams.get('list');
      return playlistId || null;
    }

    return null;
  } catch (error) {
    // Invalid URL
    return null;
  }
}

/**
 * Convert YouTube URL to embed URL format
 * Handles both videos and playlists
 * Returns null if URL is invalid or not a YouTube URL
 */
export function getYouTubeEmbedUrl(url: string): string | null {
  const videoId = extractYouTubeVideoId(url);
  const playlistId = extractYouTubePlaylistId(url);

  // If both video and playlist ID exist, embed the video within the playlist context
  if (videoId && playlistId) {
    return `https://www.youtube.com/embed/${videoId}?list=${playlistId}`;
  }

  // If only video ID exists
  if (videoId) {
    return `https://www.youtube.com/embed/${videoId}`;
  }

  // If only playlist ID exists
  if (playlistId) {
    return `https://www.youtube.com/embed?listType=playlist&list=${playlistId}`;
  }

  return null;
}

/**
 * Validate if a URL is a valid YouTube URL (video or playlist)
 */
export function isValidYouTubeUrl(url: string): boolean {
  return extractYouTubeVideoId(url) !== null || extractYouTubePlaylistId(url) !== null;
}

/**
 * Get YouTube thumbnail URL for a video
 * Returns the standard quality thumbnail (sddefault)
 * Note: This only works for individual videos, not playlists
 */
export function getYouTubeThumbnailUrl(url: string): string | null {
  const videoId = extractYouTubeVideoId(url);

  if (!videoId) {
    return null;
  }

  // Use sddefault for standard quality thumbnail (640x480)
  // Other options: default (120x90), mqdefault (320x180), hqdefault (480x360), maxresdefault (1280x720 - not always available)
  return `https://i.ytimg.com/vi/${videoId}/sddefault.jpg`;
}
