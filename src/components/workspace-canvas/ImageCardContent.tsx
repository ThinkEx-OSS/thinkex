"use client";

import { useState } from "react";
import type { Item, ImageData } from "@/lib/workspace-state/types";

interface ImageCardContentProps {
    item: Item;
}

export function ImageCardContent({ item }: ImageCardContentProps) {
    const imageData = item.data as ImageData;
    const [isHovering, setIsHovering] = useState(false);

    return (
        <div
            className="flex-1 min-h-0 relative w-full h-full"
            onMouseEnter={() => setIsHovering(true)}
            onMouseLeave={() => setIsHovering(false)}
        >
            <img
                src={imageData.url}
                alt={imageData.altText || item.name || "Image"}
                className="w-full h-full object-contain rounded-lg"
                loading="lazy"
            />

            {/* Optional: Caption overlay on hover */}
            {imageData.caption && isHovering && (
                <div className="absolute bottom-0 left-0 right-0 bg-black/60 p-2 text-white text-sm backdrop-blur-sm rounded-b-lg">
                    {imageData.caption}
                </div>
            )}
        </div>
    );
}

export default ImageCardContent;
