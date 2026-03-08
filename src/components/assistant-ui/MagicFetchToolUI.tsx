"use client";

import { makeAssistantToolUI } from "@assistant-ui/react";

type MagicFetchArgs = { description: string };
type MagicFetchResult = string;

/**
 * Invisible Tool UI for magicFetch. Registers the tool with assistant-ui
 * so it doesn't fall back to the generic ToolFallback, but renders nothing.
 */
export const MagicFetchToolUI = makeAssistantToolUI<
  MagicFetchArgs,
  MagicFetchResult
>({
  toolName: "magicFetch",
  render: () => null,
});
