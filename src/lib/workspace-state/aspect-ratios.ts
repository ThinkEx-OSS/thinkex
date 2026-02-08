/**
 * Supported aspect ratios for image cards and their corresponding grid dimensions.
 * Used for smart resizing and initial placement.
 */

export interface GridFrame {
    w: number;
    h: number;
    ratio: number;
    label: string;
}

export const ASPECT_RATIOS = {
    SQUARE: { ratio: 1.0, label: "1:1 (Square)" },
    STANDARD: { ratio: 1.33, label: "4:3 (Standard)" },
    PHOTO: { ratio: 1.5, label: "3:2 (Photo)" },
    VIDEO: { ratio: 1.77, label: "16:9 (Video)" },
    WIDE: { ratio: 1.91, label: "1.91:1 (Wide)" }
};

// Optimal grid dimensions for each aspect ratio
// Based on: Row Height = 25px, Col Width ~160px, Gap = 16px
// Grid Widths:
// 1 col = 160px
// 2 col = 336px
// 3 col = 512px
// 4 col = 688px
export const GRID_FRAMES: GridFrame[] = [
    // --- 1 COLUMN (160px) ---
    { w: 1, h: 4, ratio: 1.08, label: "1:1" },   // 160x148
    { w: 1, h: 3, ratio: 1.49, label: "4:3 / 3:2" }, // 160x107 - Compromise for Standard/Photo
    { w: 1, h: 2, ratio: 2.42, label: "16:9" },  // 160x66 - Very wide, but mathematically closest to video? Actually 1.77 of 160 is 90px (h=2.5). 
    // Let's check h=3 vs h=2 for video. h=3 is 160/107 = 1.49. h=2 is 160/66 = 2.42. 
    // Video (1.77) is right in between. We'll offer h=3 as a "tall video" option and maybe h=2 for wide.
    // Actually, let's stick to standard approx. 

    // --- 2 COLUMN (336px) ---
    // Square
    { w: 2, h: 8, ratio: 1.08, label: "1:1" },
    // 4:3
    { w: 2, h: 7, ratio: 1.24, label: "4:3" },
    // 3:2
    { w: 2, h: 6, ratio: 1.46, label: "3:2" },
    // 16:9
    { w: 2, h: 5, ratio: 1.77, label: "16:9" },

    // --- 3 COLUMN (512px) ---
    // Square
    { w: 3, h: 13, ratio: 0.99, label: "1:1" }, // 512x517
    // 4:3
    { w: 3, h: 10, ratio: 1.30, label: "4:3" }, // 512x394
    // 3:2
    { w: 3, h: 9, ratio: 1.45, label: "3:2" },  // 512x353
    // 16:9
    { w: 3, h: 8, ratio: 1.64, label: "16:9" }, // 512x312
    // 1.91:1
    { w: 3, h: 7, ratio: 1.88, label: "1.91:1" }, // 512x271

    // --- 4 COLUMN (688px) ---
    // Square
    { w: 4, h: 17, ratio: 0.99, label: "1:1" }, // 688x681
    // 4:3
    { w: 4, h: 13, ratio: 1.30, label: "4:3" }, // 688x517
    // 3:2
    { w: 4, h: 11, ratio: 1.52, label: "3:2" }, // 688x435
    // 16:9
    { w: 4, h: 10, ratio: 1.75, label: "16:9" }, // 688x394
    // 1.91:1
    { w: 4, h: 9, ratio: 1.95, label: "1.91:1" } // 688x353
];

/**
 * Finds the best matching grid frame for a given width and height (pixels or units)
 * Prioritizes smaller frames (w=2) for initial placement unless a larger frame is a significantly better match
 */
export function getBestFrameForRatio(width: number, height: number): GridFrame {
    const targetRatio = width / height;

    // First pass: Find best match among all frames
    const absoluteBest = GRID_FRAMES.reduce((prev, curr) => {
        return Math.abs(curr.ratio - targetRatio) < Math.abs(prev.ratio - targetRatio) ? curr : prev;
    });

    // Second pass: Check if there's a smaller frame (w=2) that is "good enough"
    // This prevents defaulting to huge 4-col cards unless necessary
    const smallFrames = GRID_FRAMES.filter(f => f.w === 2);
    const bestSmall = smallFrames.reduce((prev, curr) => {
        return Math.abs(curr.ratio - targetRatio) < Math.abs(prev.ratio - targetRatio) ? curr : prev;
    });

    // If the small frame is within 0.15 of target ratio, prefer it
    // Or if the absolute best is only marginally better (e.g. < 0.1 difference improvement)
    const smallError = Math.abs(bestSmall.ratio - targetRatio);
    const absoluteError = Math.abs(absoluteBest.ratio - targetRatio);

    if (smallError < 0.15 || (smallError - absoluteError) < 0.1) {
        return bestSmall;
    }

    return absoluteBest;
}

/**
 * Finds the best matching height for a given width and target ratio
 */
export function getHeightForWidthAndRatio(w: number, currentH: number): number {
    // Filter frames that match the current width
    const candidates = GRID_FRAMES.filter(f => f.w === w);

    if (candidates.length === 0) {
        return currentH;
    }

    // Find the candidate with the height closest to currentH
    return candidates.reduce((prev, curr) => {
        return Math.abs(curr.h - currentH) < Math.abs(prev.h - currentH) ? curr : prev;
    }).h;
}
