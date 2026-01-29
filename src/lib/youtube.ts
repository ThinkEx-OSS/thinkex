import { logger } from "@/lib/utils/logger";

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

export interface VideoResult {
    id: string;
    title: string;
    description: string;
    channelTitle: string;
    thumbnailUrl: string;
    publishedAt: string;
    url: string;
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

        return data.items
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

    } catch (error) {
        logger.error("❌ [YOUTUBE] Search failed:", error);
        throw error;
    }
}
