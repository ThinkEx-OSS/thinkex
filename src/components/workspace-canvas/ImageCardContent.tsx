"use client";

import { useState } from "react";
import { ImageIcon, ImageOffIcon } from "lucide-react";
import type { Item, ImageData } from "@/lib/workspace-state/types";
import { cn } from "@/lib/utils";

interface ImageCardContentProps {
    item: Item;
}

export function ImageCardContent({ item }: ImageCardContentProps) {
    const imageData = item.data as ImageData;
    const [isHovering, setIsHovering] = useState(false);
    const [loaded, setLoaded] = useState(false);
    const [hasError, setHasError] = useState(false);

    const src = imageData.url;
    const alt = imageData.altText || item.name || "Image";

    return (
        <div
            className="flex-1 min-h-0 relative w-full h-full"
            onMouseEnter={() => setIsHovering(true)}
            onMouseLeave={() => setIsHovering(false)}
        >
            {!loaded && !hasError && (
                <div className="absolute inset-0 flex items-center justify-center bg-muted/50 rounded-lg">
                    <ImageIcon className="size-8 animate-pulse text-muted-foreground" />
                </div>
            )}
            {hasError ? (
                <div className="flex flex-col items-center justify-center h-full gap-2 bg-muted/50 rounded-lg p-4 text-center">
                    <ImageOffIcon className="size-8 text-muted-foreground shrink-0" />
                    <p className="text-xs text-muted-foreground">
                        Image couldn&apos;t be displayed. HEIC/HEIF may not work in all browsers.
                    </p>
                </div>
            ) : (
                <img
                    src={src}
                    alt={alt}
                    className={cn(
                        "w-full h-full object-contain rounded-lg",
                        !loaded && "invisible"
                    )}
                    loading="lazy"
                    onLoad={() => setLoaded(true)}
                    onError={() => setHasError(true)}
                />
            )}

            {/* Optional: Caption overlay on hover */}
            {imageData.caption && isHovering && !hasError && (
                <div className="absolute bottom-0 left-0 right-0 bg-black/60 p-2 text-sm backdrop-blur-sm rounded-b-lg text-white">
                    {imageData.caption}
                </div>
            )}
        </div>
    );
}

export default ImageCardContent;
