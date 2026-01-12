import { useRef, useState } from "react";
import { useScroll, useTransform, useMotionValueEvent } from "motion/react";

export function useScrollHeader(scrollAreaRef: React.RefObject<HTMLDivElement | null>) {
  const headerScrollThreshold = 64;
  const { scrollY } = useScroll({ container: scrollAreaRef as React.RefObject<HTMLDivElement> });
  const headerOpacity = useTransform(scrollY, [0, headerScrollThreshold], [1, 0]);
  const [headerDisabled, setHeaderDisabled] = useState<boolean>(false);
  const titleInputRef = useRef<HTMLInputElement | null>(null);

  useMotionValueEvent(scrollY, "change", (y) => {
    const disable = y >= headerScrollThreshold;
    setHeaderDisabled(disable);
    if (disable) {
      titleInputRef.current?.blur();
    }
  });

  return {
    headerOpacity,
    headerDisabled,
    titleInputRef,
  };
}

