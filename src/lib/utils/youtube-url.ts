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

    // Handle youtube.com URLs
    if (urlObj.hostname.includes('youtube.com')) {
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
 * Convert YouTube URL to embed URL format
 * Returns null if URL is invalid or not a YouTube URL
 */
export function getYouTubeEmbedUrl(url: string): string | null {
  const videoId = extractYouTubeVideoId(url);

  if (!videoId) {
    return null;
  }

  // Return embed URL format
  return `https://www.youtube.com/embed/${videoId}`;
}

/**
 * Validate if a URL is a valid YouTube URL
 */
export function isValidYouTubeUrl(url: string): boolean {
  return extractYouTubeVideoId(url) !== null;
}

/**
 * Get YouTube thumbnail URL for a video
 * Returns the standard quality thumbnail (sddefault)
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
