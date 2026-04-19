"use client";

import { createContext, useContext, type FC } from "react";
import { useChatMessagePartText } from "@/lib/chat/runtime";

export const USER_MESSAGE_MAX_CHARS = 250;

export const UserMessageTruncateContext = createContext<{
  maxChars: number;
  expanded: boolean;
  showExpand: boolean;
} | null>(null);

export const UserMessageText: FC = () => {
  const { text: rawText } = useChatMessagePartText();
  const truncateCtx = useContext(UserMessageTruncateContext);

  let text = rawText;

  if (
    truncateCtx &&
    !truncateCtx.expanded &&
    truncateCtx.maxChars < Infinity &&
    text.length > truncateCtx.maxChars
  ) {
    text = text.slice(0, truncateCtx.maxChars).trim() + "...";
  }

  return <div className="whitespace-pre-wrap">{text}</div>;
};
