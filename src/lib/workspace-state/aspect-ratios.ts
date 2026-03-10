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
// Based on: Row Height = 148px, Col Width ~160px, Gap = 16px
// Grid Widths:
// 1 col = 160px
// 2 col = 336px
// 3 col = 512px
// 4 col = 688px
export const GRID_FRAMES: GridFrame[] = [
    // --- 1 COLUMN (160px) ---
    { w: 1, h: 1, ratio: 1.08, label: "1:1" }, // 160x148
    { w: 1, h: 2, ratio: 0.51, label: "Tall" }, // 160x312

    // --- 2 COLUMN (336px) ---
    { w: 2, h: 2, ratio: 1.08, label: "1:1" }, // 336x312
    { w: 2, h: 1, ratio: 2.27, label: "Wide" }, // 336x148
    { w: 2, h: 3, ratio: 0.71, label: "Portrait" }, // 336x476

    // --- 3 COLUMN (512px) ---
    { w: 3, h: 3, ratio: 1.08, label: "1:1" }, // 512x476
    { w: 3, h: 2, ratio: 1.64, label: "16:9-ish" }, // 512x312
    { w: 3, h: 4, ratio: 0.8, label: "Portrait" }, // 512x640

    // --- 4 COLUMN (688px) ---
    { w: 4, h: 4, ratio: 1.08, label: "1:1" }, // 688x640
    { w: 4, h: 3, ratio: 1.44, label: "3:2-ish" }, // 688x476
    { w: 4, h: 2, ratio: 2.21, label: "Wide" }, // 688x312
    { w: 4, h: 5, ratio: 0.86, label: "Portrait" }, // 688x804
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
