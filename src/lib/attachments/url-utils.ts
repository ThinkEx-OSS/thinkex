/**
 * Utility functions for handling URL attachments
 */

/**
 * Check if a string is a valid URL
 */
export function isValidUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Extract URLs from text
 */
export function extractUrls(text: string): string[] {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const matches = text.match(urlRegex);
  if (!matches) return [];
  
  return matches.filter(url => isValidUrl(url));
}

/**
 * Create a virtual File object from a URL for use with attachment adapter
 */
export function createUrlFile(url: string): File {
  // Create a blob with the URL as content
  const blob = new Blob([url], { type: 'text/plain' });
  
  // Create a File object from the blob
  // Use the domain name as the filename
  try {
    const urlObj = new URL(url);
    const domain = urlObj.hostname.replace('www.', '');
    const filename = `${domain}.url`;
    return new File([blob], filename, { type: 'text/plain' });
  } catch {
    return new File([blob], 'url.txt', { type: 'text/plain' });
  }
}

/**
 * Check if a File object represents a URL attachment
 */
export function isUrlFile(file: File): boolean {
  // Check if the file name ends with .url or if the content is a URL
  if (file.name.endsWith('.url')) {
    return true;
  }
  
  // Check if file content is a URL (for small files)
  if (file.size < 2048 && file.type === 'text/plain') {
    // We'll check this in the adapter by reading the file
    return false; // Will be checked by reading content
  }
  
  return false;
}

/**
 * Get media type from URL based on the platform/domain
 */
export function getMediaTypeFromUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    
    // Video platforms
    if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) {
      return 'video/mp4';
    }
    if (hostname.includes('vimeo.com')) {
      return 'video/mp4';
    }
    if (hostname.includes('twitch.tv')) {
      return 'video/mp4';
    }
    if (hostname.includes('dailymotion.com')) {
      return 'video/mp4';
    }
    
    // Audio platforms
    if (hostname.includes('soundcloud.com') || hostname.includes('spotify.com')) {
      return 'audio/mpeg';
    }
    
    // Image platforms
    if (hostname.includes('imgur.com') || hostname.includes('instagram.com')) {
      return 'image/jpeg';
    }
    
    // Document platforms
    if (hostname.includes('docs.google.com')) {
      return 'application/pdf';
    }
    
    // Default to web page
    return 'text/html';
  } catch {
    return 'text/html';
  }
}

/**
 * Check if URL is a video URL
 */
export function isVideoUrl(url: string): boolean {
  const mediaType = getMediaTypeFromUrl(url);
  return mediaType.startsWith('video/');
}

/**
 * Check if URL is an audio URL
 */
export function isAudioUrl(url: string): boolean {
  const mediaType = getMediaTypeFromUrl(url);
  return mediaType.startsWith('audio/');
}

/**
 * Get a user-friendly filename from URL
 */
export function getFilenameFromUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.replace('www.', '');
    
    // Special handling for video platforms
    if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) {
      const videoId = urlObj.searchParams.get('v') || urlObj.pathname.split('/').pop();
      return `YouTube Video ${videoId ? `(${videoId})` : ''}`;
    }
    if (hostname.includes('vimeo.com')) {
      const videoId = urlObj.pathname.split('/').pop();
      return `Vimeo Video ${videoId ? `(${videoId})` : ''}`;
    }
    
    // Default to domain name
    return hostname;
  } catch {
    return 'URL';
  }
}

/**
 * Extract URL from a File object (if it's a URL file)
 */
export async function extractUrlFromFile(file: File): Promise<string | null> {
  if (!isUrlFile(file) && file.type !== 'text/plain') {
    return null;
  }
  
  try {
    const text = await file.text();
    const trimmed = text.trim();
    
    // Check if the content is a valid URL
    if (isValidUrl(trimmed)) {
      return trimmed;
    }
    
    // Try to extract URL from text
    const urls = extractUrls(trimmed);
    if (urls.length > 0) {
      return urls[0];
    }
    
    return null;
  } catch {
    return null;
  }
}

