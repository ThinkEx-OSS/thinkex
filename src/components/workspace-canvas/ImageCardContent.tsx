"use client";

import Image from "next/image";
import { ImageIcon, ImageOffIcon } from "lucide-react";
import { useState } from "react";
import type { ImageData, Item } from "@/lib/workspace-state/types";

interface ImageCardContentProps {
  item: Item;
}

export function ImageCardContent({ item }: ImageCardContentProps) {
  const imageData = item.data as ImageData;
  const [hasError, setHasError] = useState(false);

  const src = imageData.url;
  const alt = imageData.altText || item.name || "Image";

  if (hasError) {
    return (
      <div className="flex h-full min-h-0 flex-1 flex-col items-center justify-center gap-2 rounded-md px-4 text-center">
        <ImageOffIcon className="size-5 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Preview unavailable</p>
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-0 flex-1 overflow-hidden rounded-md bg-black/5 dark:bg-white/5">
      {!src ? (
        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
          <ImageIcon className="size-5" />
        </div>
      ) : (
        <Image
          src={src}
          alt={alt}
          fill
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          className="object-cover object-top"
          onError={() => setHasError(true)}
        />
      )}
    </div>
  );
}

export default ImageCardContent;
