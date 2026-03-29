"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";

interface ThinkExLogoProps {
  size?: 24 | 32;
  className?: string;
  priority?: boolean;
}

export function ThinkExLogo({
  size = 24,
  className,
  priority,
}: ThinkExLogoProps) {
  return (
    <Image
      src="/newlogothinkex.svg"
      alt="ThinkEx Logo"
      width={size}
      height={size}
      className={cn("object-contain", className)}
      priority={priority}
    />
  );
}
