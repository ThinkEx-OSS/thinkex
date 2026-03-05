import { logger } from "@/lib/utils/logger";

/**
 * Parse ISO 8601 duration (PT1H2M30S, PT15M33S, PT30S) to human-readable format.
 */
function parseDuration(isoDuration: string): string {
    const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return "";
    const hours = parseInt(match[1] ?? "0", 10);
    const minutes = parseInt(match[2] ?? "0", 10);
    const seconds = parseInt(match[3] ?? "0", 10);
    const parts: string[] = [];
    if (hours > 0) parts.push(hours.toString());
    parts.push(minutes.toString().padStart(hours > 0 ? 2 : 1, "0"));
    parts.push(seconds.toString().padStart(2, "0"));
    return parts.join(":");
}

/**
 * Format view count to compact string (e.g. 1234567 -> "1.2M").
 */
function formatViewCount(count: string): string {
    const n = parseInt(count, 10);
    if (isNaN(n)) return "";
    if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toString();
}

interface YouTubeSearchResult {
    id: {
        videoId: string;
        kind: string;
    };
    snippet: {
        title: string;
        description: string;
        channelTitle: string;
        publishedAt: string;
        thumbnails: {
            default: { url: string };
            medium: { url: string };
            high: { url: string };
        };
    };
}

interface YouTubeSearchResponse {
    items: YouTubeSearchResult[];
    pageInfo: {
        totalResults: number;
        resultsPerPage: number;
    };
}

interface YouTubeVideosListResponse {
    items?: Array<{
        id: string;
        contentDetails?: { duration?: string };
        statistics?: { viewCount?: string };
    }>;
}

export interface VideoResult {
    id: string;
    title: string;
    description: string;
    channelTitle: string;
    thumbnailUrl: string;
    publishedAt: string;
    url: string;
    /** Human-readable duration (e.g. "12:34", "1:23:45") */
    duration?: string;
    /** View count as formatted string (e.g. "1.2M views") */
    viewCount?: string;
}

/**
 * Search for videos using the YouTube Data API
 */
export async function searchVideos(query: string, maxResults = 5): Promise<VideoResult[]> {
    const apiKey = process.env.YOUTUBE_API_KEY;

    if (!apiKey) {
        logger.error("❌ [YOUTUBE] API key not found");
        throw new Error("YouTube API key is not configured");
    }

    try {
        const url = new URL("https://www.googleapis.com/youtube/v3/search");
        url.searchParams.append("part", "snippet");
        url.searchParams.append("maxResults", maxResults.toString());
        url.searchParams.append("q", query);
        url.searchParams.append("type", "video");
        url.searchParams.append("safeSearch", "moderate");
        url.searchParams.append("key", apiKey);

        const response = await fetch(url.toString(), {
            method: "GET",
            headers: {
                "Accept": "application/json",
            },
        });

        if (!response.ok) {
            const errorText = await response.text();
            logger.error(`❌ [YOUTUBE] API Error: ${response.status} ${response.statusText}`, errorText);
            throw new Error(`YouTube API request failed: ${response.status} ${response.statusText}`);
        }

        const data = (await response.json()) as YouTubeSearchResponse;

        if (!data.items) {
            return [];
        }

        const baseResults = data.items
            .filter(item => item.id.kind === "youtube#video")
            .map(item => ({
                id: item.id.videoId,
                title: item.snippet.title,
                description: item.snippet.description,
                channelTitle: item.snippet.channelTitle,
                thumbnailUrl: item.snippet.thumbnails.medium.url,
                publishedAt: item.snippet.publishedAt,
                url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
            }));

        if (baseResults.length === 0) return baseResults;

        // Fetch duration and view count via videos.list
        try {
            const ids = baseResults.map(r => r.id).join(",");
            const videosUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
            videosUrl.searchParams.append("part", "contentDetails,statistics");
            videosUrl.searchParams.append("id", ids);
            videosUrl.searchParams.append("key", apiKey);

            const videosResponse = await fetch(videosUrl.toString(), {
                method: "GET",
                headers: { Accept: "application/json" },
            });

            if (videosResponse.ok) {
                const videosData = (await videosResponse.json()) as YouTubeVideosListResponse;
                const detailsMap = new Map<string, { duration?: string; viewCount?: string }>();

                for (const v of videosData.items ?? []) {
                    const duration = v.contentDetails?.duration
                        ? parseDuration(v.contentDetails.duration)
                        : undefined;
                    const viewCount = v.statistics?.viewCount
                        ? formatViewCount(v.statistics.viewCount)
                        : undefined;
                    detailsMap.set(v.id, { duration, viewCount });
                }

                return baseResults.map(r => {
                    const details = detailsMap.get(r.id);
                    return {
                        ...r,
                        duration: details?.duration,
                        viewCount: details?.viewCount,
                    };
                });
            }
        } catch (detailError) {
            logger.warn("⚠️ [YOUTUBE] Failed to fetch video details, returning without duration/viewCount:", detailError);
        }

        return baseResults;

    } catch (error) {
        logger.error("❌ [YOUTUBE] Search failed:", error);
        throw error;
    }
}

interface PlaylistSnippet {
    title: string;
    thumbnails: {
        default?: { url: string };
        medium?: { url: string };
        high?: { url: string };
        maxres?: { url: string };
    };
}

interface PlaylistListResponse {
    items?: Array<{ snippet: PlaylistSnippet }>;
}

/**
 * Fetch playlist metadata (title, thumbnail) using YouTube Data API v3
 */
export async function getPlaylistMetadata(playlistId: string): Promise<{ title: string; thumbnail: string | null }> {
    const apiKey = process.env.YOUTUBE_API_KEY;

    if (!apiKey) {
        logger.warn("⚠️ [YOUTUBE] API key not found, cannot fetch playlist metadata");
        return { title: "YouTube Playlist", thumbnail: null };
    }

    try {
        const url = new URL("https://www.googleapis.com/youtube/v3/playlists");
        url.searchParams.append("part", "snippet");
        url.searchParams.append("id", playlistId);
        url.searchParams.append("key", apiKey);

        const response = await fetch(url.toString(), {
            method: "GET",
            headers: { Accept: "application/json" },
        });

        if (!response.ok) {
            const errorText = await response.text();
            logger.error(`❌ [YOUTUBE] Playlist API Error: ${response.status}`, errorText);
            return { title: "YouTube Playlist", thumbnail: null };
        }

        const data = (await response.json()) as PlaylistListResponse;
        const item = data.items?.[0];

        if (!item?.snippet) {
            return { title: "YouTube Playlist", thumbnail: null };
        }

        const thumbnails = item.snippet.thumbnails;
        const thumbnail =
            thumbnails?.medium?.url ??
            thumbnails?.high?.url ??
            thumbnails?.default?.url ??
            thumbnails?.maxres?.url ??
            null;

        return {
            title: item.snippet.title || "YouTube Playlist",
            thumbnail,
        };
    } catch (error) {
        logger.error("❌ [YOUTUBE] Playlist metadata fetch failed:", error);
        return { title: "YouTube Playlist", thumbnail: null };
    }
}
