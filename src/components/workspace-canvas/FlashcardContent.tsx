"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check } from "lucide-react";
import { DocumentEditor } from "@/components/editor/DocumentEditor";
import type {
  Item,
  ItemData,
  FlashcardData,
} from "@/lib/workspace-state/types";
import { StreamdownMarkdown } from "@/components/ui/streamdown-markdown";
import { cn } from "@/lib/utils";

interface FlashcardContentProps {
  item: Item;
  onUpdateData: (updater: (prev: ItemData) => ItemData) => void;
}

function FlashcardSideEditable({
  title,
  markdown,
  emptyLabel,
  isEditing,
  onStartEditing,
  onStopEditing,
  onChange,
  cardName,
}: {
  title: string;
  markdown: string;
  emptyLabel: string;
  isEditing: boolean;
  onStartEditing: () => void;
  onStopEditing: () => void;
  onChange: (markdown: string) => void;
  cardName?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isEditing) return;
    const el = containerRef.current;
    if (!el) return;

    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      onStopEditing();
    };

    el.addEventListener("keydown", handler);
    return () => el.removeEventListener("keydown", handler);
  }, [isEditing, onStopEditing]);

  return (
    <div ref={containerRef}>
      <div className="mb-2 flex items-center justify-between">
        <div className="block text-sm font-medium text-foreground/70 dark:text-white/70">
          {title}
        </div>
        {isEditing && (
          <button
            type="button"
            onClick={onStopEditing}
            className="inline-flex items-center gap-1 rounded-md border border-foreground/10 px-2 py-1 text-xs text-foreground/70 hover:bg-foreground/5 dark:border-white/10 dark:text-white/70 dark:hover:bg-white/5"
          >
            <Check className="h-3.5 w-3.5" />
            Done
          </button>
        )}
      </div>
      <div
        className={cn(
          "min-h-[150px] overflow-hidden rounded-lg border transition-colors",
          isEditing
            ? "border-foreground/30 bg-foreground/[0.03] dark:border-white/30 dark:bg-white/[0.03]"
            : "cursor-text border-foreground/10 bg-foreground/5 hover:border-foreground/20 dark:border-white/10 dark:bg-white/5 dark:hover:border-white/20",
        )}
        style={{ backdropFilter: "blur(8px)" }}
        onClick={(e) => {
          if (isEditing) return;
          const target = e.target as HTMLElement;
          if (target.closest("a")) return;
          onStartEditing();
        }}
      >
        {isEditing ? (
          <DocumentEditor
            autofocus={true}
            cardName={cardName}
            content={markdown || undefined}
            contentType={markdown ? "markdown" : undefined}
            embedded={true}
            showThemeToggle={false}
            onUpdate={({ markdown: nextMarkdown }) => onChange(nextMarkdown)}
          />
        ) : !markdown.trim() ? (
          <div className="p-3 text-sm text-foreground/40 dark:text-white/40">
            {emptyLabel}
          </div>
        ) : (
          <div className="relative min-h-[160px] space-y-2 p-3 text-sm leading-6">
            <StreamdownMarkdown className="text-sm leading-6 text-foreground dark:text-white">
              {markdown}
            </StreamdownMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}

export function FlashcardContent({ item, onUpdateData }: FlashcardContentProps) {
  const flashcardData = item.data as FlashcardData;
  const cards = useMemo(() => flashcardData.cards ?? [], [flashcardData.cards]);
  const [editing, setEditing] = useState<{
    cardId: string;
    side: "front" | "back";
  } | null>(null);

  // Local drafts override stale `card.front`/`card.back` while `onUpdateData`
  // is debounced (~500ms). Without this, re-entering a side within the
  // debounce window would mount the editor with the stale props value and
  // silently drop the queued keystrokes when the user types again. Drafts
  // also prevent the read-only preview from flickering back to old content
  // between Done and flush.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const draftKey = (cardId: string, side: "front" | "back") =>
    `${cardId}:${side}`;

  const resolveMarkdown = useCallback(
    (card: { id: string; front: string; back: string }, side: "front" | "back"): string => {
      const draft = drafts[draftKey(card.id, side)];
      const source = side === "front" ? card.front : card.back;
      return draft ?? source;
    },
    [drafts],
  );

  // Drop a draft once the authoritative source (item.data) catches up, so
  // future remote edits via realtime sync aren't masked by a stale local
  // override.
  useEffect(() => {
    setDrafts((prev) => {
      let changed = false;
      const next: Record<string, string> = {};
      for (const [key, value] of Object.entries(prev)) {
        const [cardId, side] = key.split(":") as [string, "front" | "back"];
        const card = cards.find((c) => c.id === cardId);
        if (!card) {
          changed = true;
          continue;
        }
        const source = side === "front" ? card.front : card.back;
        if (source === value) {
          changed = true;
          continue;
        }
        next[key] = value;
      }
      return changed ? next : prev;
    });
  }, [cards]);

  const handleChange = useCallback(
    (cardId: string, side: "front" | "back", markdown: string) => {
      setDrafts((prev) => ({ ...prev, [draftKey(cardId, side)]: markdown }));
      onUpdateData((prev) => {
        const prevFc = prev as FlashcardData;
        return {
          ...prevFc,
          cards: (prevFc.cards ?? []).map((c) =>
            c.id === cardId ? { ...c, [side]: markdown } : c,
          ),
        } as FlashcardData;
      });
    },
    [onUpdateData],
  );

  return (
    <div className="flex-1 overflow-y-auto modal-scrollable">
      <div className="max-w-5xl mx-auto p-6 pb-24">
        {cards.length === 0 ? (
          <div className="rounded-2xl border border-foreground/10 bg-foreground/5/50 p-5 text-sm text-foreground/50 shadow-inner dark:border-white/10 dark:bg-white/5/50 dark:text-white/50">
            No flashcards available.
          </div>
        ) : (
          <div className="space-y-6">
            {cards.map((card, index) => (
              <div
                key={card.id}
                className="relative rounded-2xl border border-foreground/10 bg-foreground/5/50 p-5 shadow-inner dark:border-white/10 dark:bg-white/5/50"
                style={{ backdropFilter: "blur(8px)" }}
              >
                <div className="absolute -top-3 -left-3">
                  <div className="flex h-8 min-w-[2.2rem] items-center justify-center rounded-full bg-black/70 px-2 text-xs font-semibold text-foreground shadow-md dark:text-white">
                    #{index + 1}
                  </div>
                </div>

                <div className="space-y-6">
                  <FlashcardSideEditable
                    title="Front"
                    markdown={resolveMarkdown(card, "front")}
                    emptyLabel="No front content"
                    isEditing={
                      editing?.cardId === card.id && editing.side === "front"
                    }
                    onStartEditing={() =>
                      setEditing({ cardId: card.id, side: "front" })
                    }
                    onStopEditing={() => setEditing(null)}
                    onChange={(markdown) =>
                      handleChange(card.id, "front", markdown)
                    }
                    cardName={item.name}
                  />

                  <FlashcardSideEditable
                    title="Back"
                    markdown={resolveMarkdown(card, "back")}
                    emptyLabel="No back content"
                    isEditing={
                      editing?.cardId === card.id && editing.side === "back"
                    }
                    onStartEditing={() =>
                      setEditing({ cardId: card.id, side: "back" })
                    }
                    onStopEditing={() => setEditing(null)}
                    onChange={(markdown) =>
                      handleChange(card.id, "back", markdown)
                    }
                    cardName={item.name}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default FlashcardContent;
