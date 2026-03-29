"use client";

import dynamic from "next/dynamic";
import { schema } from "./schema";

// Get the Block type from our custom schema
type Block = (typeof schema)["Block"];

// Dynamic import to ensure BlockNote is only loaded on the client-side
const BlockNoteEditor = dynamic(() => import("./BlockNoteEditor"), {
  ssr: false,
});

interface LazyBlockNoteEditorProps {
  initialContent?: Block[];
  onChange?: (blocks: Block[]) => void;
  readOnly?: boolean;
  cardName?: string; // Optional card name for attachment naming
  cardId?: string; // Optional card ID for selection tracking
  lastSource?: 'user' | 'agent';
  autofocus?: boolean | "start" | "end"; // Auto-focus the editor when it opens
  sources?: Array<{ url: string; title: string }>;
}

export function LazyBlockNoteEditor({ initialContent, onChange, readOnly, cardName, cardId, lastSource, autofocus, sources }: LazyBlockNoteEditorProps) {
  return <BlockNoteEditor initialContent={initialContent} onChange={onChange} readOnly={readOnly} cardName={cardName} cardId={cardId} lastSource={lastSource} autofocus={autofocus} sources={sources} />;
}

export default LazyBlockNoteEditor;
