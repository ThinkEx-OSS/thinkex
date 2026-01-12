"use client";

import { useCallback, useMemo, useState, useEffect } from "react";
import type { Item, ItemData, FlashcardData, FlashcardItem } from "@/lib/workspace-state/types";
import { DynamicBlockNoteEditor } from "@/components/editor/DynamicBlockNoteEditor";
import { PreviewBlock } from "@/components/editor/BlockNotePreview";
import { plainTextToBlocks, type Block } from "@/components/editor/BlockNoteEditor";
import { Plus, Trash2 } from "lucide-react";
import { generateItemId } from "@/lib/workspace-state/item-helpers";

interface FlashcardContentProps {
    item: Item;
    onUpdateData: (updater: (prev: ItemData) => ItemData) => void;
}

export function FlashcardContent({ item, onUpdateData }: FlashcardContentProps) {
    const flashcardData = item.data as FlashcardData;
    const [activeSection, setActiveSection] = useState<{ cardId: string, side: 'front' | 'back' } | null>(null);

    // --- MIGRATION & DATA SYNC ---
    // Ensure 'cards' array exists. If not, migrate legacy single card to array.
    const hasMigratedRef = useState(false); // Ref-like state to track migration per mount

    useEffect(() => {
        if (!flashcardData.cards || flashcardData.cards.length === 0) {
            // Check for legacy content
            if (flashcardData.front || flashcardData.frontBlocks || flashcardData.back || flashcardData.backBlocks) {
                // Migrate legacy content to first card
                const legacyCard: FlashcardItem = {
                    id: generateItemId(),
                    front: flashcardData.front || "",
                    back: flashcardData.back || "",
                    frontBlocks: flashcardData.frontBlocks || [],
                    backBlocks: flashcardData.backBlocks || []
                };
                onUpdateData(prev => ({ ...prev, cards: [legacyCard] }));
            } else {
                // Initialize with empty card if absolutely no data
                onUpdateData(prev => ({
                    ...prev,
                    cards: [{
                        id: generateItemId(),
                        front: "",
                        back: "",
                        frontBlocks: [],
                        backBlocks: []
                    }]
                }));
            }
        }
    }, [flashcardData.cards, flashcardData.front, flashcardData.back, onUpdateData]);

    const cards = flashcardData.cards || [];

    // --- HELPERS ---

    const getBlocks = useCallback((blocks?: Block[] | null, fallbackText?: string) => {
        if (blocks && Array.isArray(blocks) && blocks.length > 0) return blocks as Block[];
        return plainTextToBlocks(fallbackText || "");
    }, []);

    const blocksToPlainText = useCallback((blocks: Block[]): string => {
        if (!blocks || blocks.length === 0) return "";
        return blocks
            .map((block) => {
                const blockData = block as { content?: Array<{ text?: string }> };
                if (blockData.content && Array.isArray(blockData.content)) {
                    return blockData.content.map((item) => item.text || "").join("");
                }
                return "";
            })
            .join("\n");
    }, []);

    const updateCard = useCallback((cardId: string, updates: Partial<FlashcardItem>) => {
        onUpdateData((prev) => {
            const currentData = prev as FlashcardData;
            const newCards = currentData.cards.map(card =>
                card.id === cardId ? { ...card, ...updates } : card
            );
            return { ...prev, cards: newCards };
        });
    }, [onUpdateData]);

    const addCard = useCallback(() => {
        const newCard: FlashcardItem = {
            id: generateItemId(),
            front: "",
            back: "",
            frontBlocks: [],
            backBlocks: []
        };
        onUpdateData((prev) => {
            const currentData = prev as FlashcardData;
            return { ...prev, cards: [...(currentData.cards || []), newCard] };
        });
    }, [onUpdateData]);

    const removeCard = useCallback((cardId: string) => {
        onUpdateData((prev) => {
            const currentData = prev as FlashcardData;
            // Don't remove the last card
            if (currentData?.cards?.length <= 1) return prev;
            return { ...prev, cards: currentData.cards.filter(c => c.id !== cardId) };
        });
    }, [onUpdateData]);

    // Exit edit mode on outside click or Escape
    useEffect(() => {
        if (!activeSection) return;

        const editingKey = `editor-${activeSection.cardId}-${activeSection.side}`;

        const handleClickOutside = (event: MouseEvent) => {
            const editorEl = document.querySelector(`[data-editing-key="${editingKey}"]`);
            if (!editorEl || !(event.target instanceof Node)) return;
            if (!editorEl.contains(event.target)) {
                setActiveSection(null);
            }
        };

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setActiveSection(null);
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        document.addEventListener("keydown", handleEscape);

        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
            document.removeEventListener("keydown", handleEscape);
        };
    }, [activeSection]);

    return (
        <div className="flex-1 overflow-y-auto modal-scrollable">
            <div className="max-w-5xl mx-auto p-6 pb-24">
                <div className="space-y-6">
                    {cards.map((card, index) => (
                        <div
                            key={card.id}
                            className="relative group rounded-2xl border border-white/10 bg-white/5/50 p-5 shadow-inner"
                            style={{ backdropFilter: 'blur(8px)' }}
                        >
                            <div className="absolute -top-3 -left-3">
                                <div className="flex h-8 min-w-[2.2rem] items-center justify-center rounded-full bg-black/70 px-2 text-xs font-semibold text-white shadow-md">
                                    #{index + 1}
                                </div>
                            </div>
                            {/* Card Header / Controls */}
                            {cards.length > 1 && (
                                <div className="absolute -top-3 -right-3">
                                    <button
                                        onClick={() => removeCard(card.id)}
                                        className="p-2 rounded-full bg-black/60 text-white/80 hover:text-white hover:bg-red-500/80 transition-colors shadow-md cursor-pointer"
                                        title="Delete this card"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            )}

                            <div className="space-y-6">
                                {/* Front Editor */}
                                <div
                                    className={`relative transition-all duration-200 ${activeSection?.cardId === card.id && activeSection?.side === 'front'
                                            ? 'z-30'
                                            : 'z-20'
                                        }`}
                                    onClick={() => setActiveSection({ cardId: card.id, side: 'front' })}
                                    onFocus={() => setActiveSection({ cardId: card.id, side: 'front' })}
                                >
                                    <label className="block text-sm font-medium text-white/70 mb-2">Front</label>
                                    {activeSection?.cardId === card.id && activeSection?.side === 'front' ? (
                                        <div
                                            data-editing-key={`editor-${card.id}-front`}
                                            className="rounded-lg border border-white/15 bg-white/5 min-h-[150px] shadow-inner"
                                            style={{ backdropFilter: 'blur(8px)' }}
                                        >
                                            <DynamicBlockNoteEditor
                                                initialContent={getBlocks(card.frontBlocks as Block[] || [], card.front)}
                                                onChange={(blocks) => updateCard(card.id, {
                                                    frontBlocks: blocks,
                                                    front: blocksToPlainText(blocks)
                                                })}
                                                cardName={`${item.name} - Card ${index + 1} (Front)`}
                                                cardId={`${card.id}-front`}
                                            />
                                        </div>
                                    ) : (
                                        <button
                                            type="button"
                                            className="group/editor relative w-full text-left rounded-lg border border-white/10 bg-white/5 min-h-[150px] overflow-hidden transition hover:border-white/20 hover:bg-white/10 cursor-pointer"
                                            style={{ backdropFilter: 'blur(8px)' }}
                                            onClick={() => setActiveSection({ cardId: card.id, side: 'front' })}
                                            aria-label="Click to edit front"
                                        >
                                            <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/50 pointer-events-none opacity-0 group-hover/editor:opacity-100 transition">
                                                <span className="rounded-md bg-black/80 px-3 py-1.5 text-xs font-medium text-white shadow-md">
                                                    Click to edit
                                                </span>
                                            </div>
                                            <div className="relative z-0 p-3">
                                                {getBlocks(card.frontBlocks as Block[] || [], card.front).length > 0 ? (
                                                    <div className="relative min-h-[160px] space-y-2">
                                                        {getBlocks(card.frontBlocks as Block[] || [], card.front).map((block, i, all) => (
                                                            <PreviewBlock
                                                                key={(block as any).id || i}
                                                                block={block}
                                                                index={i}
                                                                blocks={all as Block[]}
                                                                isScrollLocked={false}
                                                            />
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <div className="text-sm text-white/40">Click to edit</div>
                                                )}
                                            </div>
                                        </button>
                                    )}
                                </div>

                                {/* Back Editor */}
                                <div
                                    className={`relative transition-all duration-200 ${activeSection?.cardId === card.id && activeSection?.side === 'back'
                                            ? 'z-30'
                                            : 'z-10'
                                        }`}
                                    onClick={() => setActiveSection({ cardId: card.id, side: 'back' })}
                                    onFocus={() => setActiveSection({ cardId: card.id, side: 'back' })}
                                >
                                    <label className="block text-sm font-medium text-white/70 mb-2">Back</label>
                                    {activeSection?.cardId === card.id && activeSection?.side === 'back' ? (
                                        <div
                                            data-editing-key={`editor-${card.id}-back`}
                                            className="rounded-lg border border-white/15 bg-white/5 min-h-[150px] shadow-inner"
                                            style={{ backdropFilter: 'blur(8px)' }}
                                        >
                                            <DynamicBlockNoteEditor
                                                initialContent={getBlocks(card.backBlocks as Block[] || [], card.back)}
                                                onChange={(blocks) => updateCard(card.id, {
                                                    backBlocks: blocks,
                                                    back: blocksToPlainText(blocks)
                                                })}
                                                cardName={`${item.name} - Card ${index + 1} (Back)`}
                                                cardId={`${card.id}-back`}
                                            />
                                        </div>
                                    ) : (
                                        <button
                                            type="button"
                                            className="group/editor relative w-full text-left rounded-lg border border-white/10 bg-white/5 min-h-[150px] overflow-hidden transition hover:border-white/20 hover:bg-white/10 cursor-pointer"
                                            style={{ backdropFilter: 'blur(8px)' }}
                                            onClick={() => setActiveSection({ cardId: card.id, side: 'back' })}
                                            aria-label="Click to edit back"
                                        >
                                            <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/50 pointer-events-none opacity-0 group-hover/editor:opacity-100 transition">
                                                <span className="rounded-md bg-black/80 px-3 py-1.5 text-xs font-medium text-white shadow-md">
                                                    Click to edit
                                                </span>
                                            </div>
                                            <div className="relative z-0 p-3">
                                                {getBlocks(card.backBlocks as Block[] || [], card.back).length > 0 ? (
                                                    <div className="relative min-h-[160px] space-y-2">
                                                        {getBlocks(card.backBlocks as Block[] || [], card.back).map((block, i, all) => (
                                                            <PreviewBlock
                                                                key={(block as any).id || i}
                                                                block={block}
                                                                index={i}
                                                                blocks={all as Block[]}
                                                                isScrollLocked={false}
                                                            />
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <div className="text-sm text-white/40">Click to edit</div>
                                                )}
                                            </div>
                                        </button>
                                    )}
                                </div>
                            </div>

                        </div>
                    ))}

                    {/* Add Card Button */}
                    <button
                        onClick={addCard}
                        className="w-full py-4 border-2 border-dashed border-white/10 hover:border-white/20 rounded-xl flex items-center justify-center gap-2 text-white/50 hover:text-white/80 transition-all group cursor-pointer"
                    >
                        <div className="p-1 rounded-full bg-white/5 group-hover:bg-white/10">
                            <Plus className="w-5 h-5" />
                        </div>
                        <span className="font-medium">Add Flashcard</span>
                    </button>
                </div>
            </div>
        </div>
    );
}

export default FlashcardContent;
