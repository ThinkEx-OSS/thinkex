"use client";

import { X } from "lucide-react";
import { useEffect, useCallback, useRef, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import ItemHeader from "@/components/workspace-canvas/ItemHeader";
import CardRenderer from "@/components/workspace-canvas/CardRenderer";
import ChatFloatingButton from "@/components/chat/ChatFloatingButton";
import SpotlightModal from "@/components/SpotlightModal";
import { getCardColorCSS, getCardAccentColor, getWhiteTintedColor } from "@/lib/workspace-state/colors";
import type { Item, ItemData } from "@/lib/workspace-state/types";
import { useUIStore, selectSelectedCardIdsArray } from "@/lib/stores/ui-store";
import { useShallow } from "zustand/react/shallow";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatKeyboardShortcut } from "@/lib/utils/keyboard-shortcut";

interface FlashcardModalProps {
    item: Item;
    isOpen: boolean;
    onClose: () => void;
    onUpdateItem: (updates: Partial<Item>) => void;
    onUpdateItemData: (updater: (prev: ItemData) => ItemData) => void;
}

export function FlashcardModal({
    item,
    isOpen,
    onClose,
    onUpdateItem,
    onUpdateItemData,
}: FlashcardModalProps) {
    const renderStart = useRef(performance.now());
    const [isContentReady, setIsContentReady] = useState(false);

    const toggleCardSelection = useUIStore((state) => state.toggleCardSelection);
    // Get global chat state from UI store
    const isChatExpanded = useUIStore((state) => state.isChatExpanded);
    const setIsChatExpanded = useUIStore((state) => state.setIsChatExpanded);

    // Use array selector with shallow comparison to prevent unnecessary re-renders and SSR issues
    const selectedCardIdsArray = useUIStore(
        useShallow(selectSelectedCardIdsArray)
    );
    const selectedCardIds = useMemo(() => new Set(selectedCardIdsArray), [selectedCardIdsArray]);

    useEffect(() => {
        if (isOpen) {
            renderStart.current = performance.now();
            // Reset content ready state when opening
            setIsContentReady(false);

            // Defer content rendering to allow modal animation to start immediately
            const frameId = requestAnimationFrame(() => {
                setTimeout(() => {
                    setIsContentReady(true);
                }, 10);
            });

            return () => cancelAnimationFrame(frameId);
        } else {
            setIsContentReady(false);
        }
    }, [isOpen]);

    // Track whether we selected the card (so we know whether to deselect on cleanup)
    useEffect(() => {
        // Only run when modal is open and we have an item
        if (!isOpen || !item?.id) return;

        // Check if card was already selected at the time of opening
        const wasAlreadySelected = selectedCardIds.has(item.id);

        // If not already selected, select it now
        if (!wasAlreadySelected) {
            toggleCardSelection(item.id);

            // Only deselect on cleanup if we were the ones who selected it
            return () => {
                toggleCardSelection(item.id);
            };
        }

        // If it was already selected, don't change anything on cleanup
        return undefined;
    }, [isOpen, item?.id]); // Removed selectedCardIds and toggleCardSelection from deps

    // Handle escape key
    const handleEscape = useCallback(
        (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                onClose();
            }
        },
        [onClose]
    );

    useEffect(() => {
        if (isOpen) {
            document.addEventListener("keydown", handleEscape);
        }
        return () => {
            document.removeEventListener("keydown", handleEscape);
        };
    }, [isOpen, handleEscape]);

    return (
        <AnimatePresence mode="wait">
            {isOpen && (
                <div
                    className="absolute inset-0 z-30 flex items-center justify-center overflow-hidden flashcard-modal"
                >
                    {/* Backdrop with blur */}
                    <motion.div
                        className="absolute inset-0 bg-black/60 backdrop-blur-xl"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                        onClick={onClose}
                    />

                    {/* Modal Content - fullscreen flashcard detail view */}
                    <SpotlightModal
                        className="relative z-10 w-full h-full"
                        spotlightColor="rgba(135, 206, 235, 0.15)"
                    >
                        <motion.div
                            className="w-full h-full flex flex-col shadow-2xl overflow-hidden"
                            style={{
                                backgroundColor: item.color
                                    ? getCardColorCSS(item.color, 0.1)
                                    : "rgba(0, 0, 0, 0.1)",
                                backdropFilter: "blur(24px)",
                                WebkitBackdropFilter: "blur(24px)",
                            }}
                            initial={{ opacity: 0, scale: 0.98 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.98 }}
                            transition={{ duration: 0.1, ease: [0.16, 1, 0.3, 1] }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Header with title and close button */}
                            <div
                                className="border-b"
                                style={{
                                    borderColor: item.color
                                        ? getCardAccentColor(item.color, 0.2)
                                        : "rgba(255, 255, 255, 0.15)",
                                }}
                            >
                                <div className="flex items-center justify-between py-2 px-3">
                                    <div className="flex items-center gap-2 flex-1 min-w-0">
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <SidebarTrigger />
                                            </TooltipTrigger>
                                            <TooltipContent side="right">
                                                Toggle Sidebar <kbd className="ml-1 pointer-events-none inline-flex h-5 select-none items-center gap-1 font-mono text-sm font-medium text-muted-foreground opacity-100">{formatKeyboardShortcut('S', true)}</kbd>
                                            </TooltipContent>
                                        </Tooltip>
                                        <div className="flex-1 min-w-0">
                                            <ItemHeader
                                                id={item.id}
                                                name={item.name}
                                                subtitle={item.subtitle}
                                                description=""
                                                onNameChange={(v) => onUpdateItem({ name: v })}
                                                onNameCommit={(v) => onUpdateItem({ name: v })}
                                                onSubtitleChange={(v) => onUpdateItem({ subtitle: v })}
                                                noMargin={true}
                                                textSize="lg"
                                                fullWidth
                                            />
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                        <ChatFloatingButton
                                            isDesktop={true}
                                            isChatExpanded={isChatExpanded}
                                            setIsChatExpanded={setIsChatExpanded}
                                        />
                                        <button
                                            type="button"
                                            onClick={onClose}
                                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border text-sidebar-foreground/70 hover:text-sidebar-foreground transition-colors cursor-pointer"
                                            style={{
                                                borderColor: item.color
                                                    ? getCardAccentColor(item.color, 0.2)
                                                    : "rgba(255, 255, 255, 0.15)",
                                            }}
                                            onMouseEnter={(e) => {
                                                const hoverColor = item.color
                                                    ? getWhiteTintedColor(item.color, 0.8, 0.15)
                                                    : "rgba(255, 255, 255, 0.15)";
                                                e.currentTarget.style.backgroundColor = hoverColor;
                                            }}
                                            onMouseLeave={(e) => {
                                                e.currentTarget.style.backgroundColor = "transparent";
                                            }}
                                            aria-label="Close"
                                        >
                                            <X className="h-5 w-5" />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Content - full flashcard editing interface */}
                            <div
                                className="flex-1 overflow-y-auto modal-scrollable flex flex-col"
                                style={{
                                    ['--scrollbar-color' as string]: item.color
                                        ? getWhiteTintedColor(item.color, 0.7, 0.2)
                                        : "rgba(255, 255, 255, 0.2)",
                                }}
                            >
                                {isContentReady ? (
                                    <CardRenderer
                                        key={item.id}
                                        item={item}
                                        onUpdateData={onUpdateItemData}

                                    />
                                ) : (
                                    <div className="p-6 space-y-4">
                                        <div className="h-8 w-3/4 bg-white/10 rounded animate-pulse" />
                                        <div className="h-4 w-full bg-white/10 rounded animate-pulse" />
                                        <div className="h-4 w-5/6 bg-white/10 rounded animate-pulse" />
                                        <div className="h-32 w-full bg-white/5 rounded animate-pulse mt-8" />
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </SpotlightModal>
                </div>
            )}
        </AnimatePresence>
    );
}

export default FlashcardModal;
