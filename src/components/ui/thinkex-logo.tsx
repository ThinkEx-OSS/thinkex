"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";

interface ThinkExLogoProps {
  size?: 24 | 32 | 38 | 48;
  className?: string;
  priority?: boolean;
}

export function ThinkExLogo({
  size = 24,
  className,
  priority,
}: ThinkExLogoProps) {
  const imgClass = cn("object-contain", className);
  return (
    <>
      <Image
        src="/newlogothinkex-light.svg"
        alt="ThinkEx Logo"
        width={size}
        height={size}
        className={cn(imgClass, "dark:hidden")}
        priority={priority}
      />
      <Image
        src="/newlogothinkex-dark.svg"
        alt="ThinkEx Logo"
        width={size}
        height={size}
        className={cn(imgClass, "hidden dark:block")}
        priority={priority}
      />
    </>
  );
}
