"use client";

import { useSyncExternalStore } from "react";
import Image from "next/image";
import { useTheme } from "next-themes";
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
  const { resolvedTheme } = useTheme();
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  if (!mounted) {
    return (
      <span
        aria-hidden="true"
        className={cn("inline-block shrink-0", className)}
        style={{ width: size, height: size }}
      />
    );
  }

  const src =
    resolvedTheme === "dark"
      ? "/newlogothinkex-dark.svg"
      : "/newlogothinkex-light.svg";

  return (
    <Image
      src={src}
      alt="ThinkEx Logo"
      width={size}
      height={size}
      className={cn("object-contain", className)}
      priority={priority}
    />
  );
}
