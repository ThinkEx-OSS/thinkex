"use client";

import { useEffect, useState } from "react";

export function HeroGlow() {
  const [mousePosition, setMousePosition] = useState({ x: 0.5, y: 0.5 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      // Use requestAnimationFrame to throttle state updates if needed,
      // but React 18 automatic batching usually handles this well.
      // For creating a buttery smooth effect, updating on every frame is okay
      // as long as the component is lightweight.
      setMousePosition({
        x: e.clientX / window.innerWidth,
        y: e.clientY / window.innerHeight,
      });
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  // Calculate glow intensity based on distance from hero center
  const centerX = 0.5;
  const centerY = 0.45; // Hero is slightly above center
  const distance = Math.sqrt(
    Math.pow(mousePosition.x - centerX, 2) +
      Math.pow(mousePosition.y - centerY, 2),
  );
  // Glow is strongest at center (distance=0), fades as you move away
  const glowIntensity = Math.max(0, 1 - distance * 2);

  const blur = 32 + glowIntensity * 18;
  const lightGlow = `radial-gradient(ellipse at center,
      rgba(156, 146, 250, ${0.25 + glowIntensity * 0.08}) 0%,
      rgba(167, 139, 250, ${0.2 + glowIntensity * 0.08}) 35%,
      rgba(140, 130, 220, 0.08) 80%,
      rgba(130, 120, 200, 0.04) 100%)`;
  const darkGlow = `radial-gradient(ellipse at center,
      rgba(156, 146, 250, ${0.65 + glowIntensity * 0.1}) 0%,
      rgba(167, 139, 250, ${0.55 + glowIntensity * 0.1}) 35%,
      rgba(140, 130, 220, 0.14) 80%,
      rgba(130, 120, 200, 0.06) 100%)`;

  return (
    <>
      <div
        className="absolute -inset-20 rounded-3xl pointer-events-none transition-opacity duration-300 dark:hidden"
        style={{
          background: lightGlow,
          filter: `blur(${blur}px)`,
          opacity: 1,
          zIndex: 0,
        }}
      />
      <div
        className="absolute -inset-20 hidden rounded-3xl pointer-events-none transition-opacity duration-300 dark:block"
        style={{
          background: darkGlow,
          filter: `blur(${blur}px)`,
          opacity: 1,
          zIndex: 0,
        }}
      />
      <div
        className="absolute -inset-8 hidden rounded-3xl pointer-events-none dark:block"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(0, 0, 0, 0.5) 0%, rgba(0, 0, 0, 0.25) 40%, transparent 70%)",
          filter: "blur(10px)",
          zIndex: 1,
        }}
      />
    </>
  );
}
