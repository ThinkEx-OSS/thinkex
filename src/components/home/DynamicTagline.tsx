"use client";

import { useState, useEffect } from "react";

const TAGLINES = [
  "What we think, we become.",
  "Think deeper, learn faster.",
  "Think it through, together.",
  "Great minds think connected.",
  "Think outside the chat.",
];

export function DynamicTagline() {
  // Use deterministic initial value to avoid hydration mismatch
  const [tagline, setTagline] = useState(TAGLINES[0]);

  // Pick random tagline after mount (client-only)
  useEffect(() => {
    setTagline(TAGLINES[Math.floor(Math.random() * TAGLINES.length)]);
  }, []);

  return (
    <h1 className="text-2xl md:text-3xl font-light text-foreground">
      {tagline}
    </h1>
  );
}
