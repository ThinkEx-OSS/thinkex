"use client";

import { useMemo } from "react";

const TAGLINES = [
  "What we think, we become.",
  "Think deeper, learn faster.",
  "Think it through, together.",
  "Great minds think connected.",
  "Think outside the chat.",
];

export function DynamicTagline() {
  const tagline = useMemo(() => {
    return TAGLINES[Math.floor(Math.random() * TAGLINES.length)];
  }, []);

  return (
    <h1 className="text-2xl md:text-3xl font-light text-foreground">
      {tagline}
    </h1>
  );
}
