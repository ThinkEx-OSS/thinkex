"use client";

import { Agentation } from "agentation";

export function AgentationDev() {
  if (process.env.NODE_ENV !== "development") return null;
  return <Agentation />;
}
