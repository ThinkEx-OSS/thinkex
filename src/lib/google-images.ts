import { logger } from "@/lib/utils/logger";

interface GoogleSearchImage {
    link: string;
    title: string;
    image: {
        contextLink: string;
        height: number;
        width: number;
        thumbnailLink: string;
        thumbnailHeight: number;
        thumbnailWidth: number;
    };
}

interface GoogleSearchResponse {
    items?: GoogleSearchImage[];
    error?: {
        code: number;
        message: string;
        status: string;
    };
}

export interface ImageResult {
    url: string;
    title: string;
    thumbnailUrl: string;
    width: number;
    height: number;
    contextLink: string;
}

/**
 * Search for images using the Google Custom Search JSON API
 */
export async function searchGoogleImages(query: string, maxResults = 10): Promise<ImageResult[]> {
    const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
    const cx = process.env.GOOGLE_SEARCH_CX;

    if (!apiKey || !cx) {
        logger.warn("⚠️ [GOOGLE-IMAGES] Missing API Key or CX");
        throw new Error("MISSING_KEYS");
    }

    try {
        const url = new URL("https://www.googleapis.com/customsearch/v1");
        url.searchParams.append("q", query);
        url.searchParams.append("cx", cx);
        url.searchParams.append("key", apiKey);
        url.searchParams.append("searchType", "image");
        url.searchParams.append("num", maxResults.toString());
        url.searchParams.append("safe", "active"); // SafeSearch

        const response = await fetch(url.toString(), {
            method: "GET",
            headers: {
                "Accept": "application/json",
            },
        });

        const data = (await response.json()) as GoogleSearchResponse;

        if (!response.ok) {
            const errorMessage = data.error?.message || response.statusText;
            logger.error(`❌ [GOOGLE-IMAGES] API Error: ${response.status}`, errorMessage);
            throw new Error(`Google API request failed: ${errorMessage}`);
        }

        if (!data.items) {
            return [];
        }

        return data.items.map((item) => ({
            url: item.link,
            title: item.title,
            thumbnailUrl: item.image.thumbnailLink,
            width: item.image.width,
            height: item.image.height,
            contextLink: item.image.contextLink,
        }));

    } catch (error) {
        logger.error("❌ [GOOGLE-IMAGES] Search failed:", error);
        throw error;
    }
}
