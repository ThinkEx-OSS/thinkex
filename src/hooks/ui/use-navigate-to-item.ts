"use client";

import { useCallback } from "react";
import { useUIStore } from "@/lib/stores/ui-store";
import { useWorkspaceStore } from "@/lib/stores/workspace-store";
import { useWorkspaceState } from "@/hooks/workspace/use-workspace-state";
import { toast } from "sonner";

let activeCleanup: (() => void) | null = null;

/**
 * Hook that provides a function to navigate to and highlight an item in the workspace.
 */
export function useNavigateToItem() {
    const workspaceId = useWorkspaceStore((state) => state.currentWorkspaceId);
    const { state: workspaceState } = useWorkspaceState(workspaceId);
    const setActiveFolderId = useUIStore((state) => state.setActiveFolderId);

    const navigateToItem = useCallback(
        (itemId: string, options?: { silent?: boolean }): boolean => {
            if (!workspaceState?.items) {
                if (!options?.silent) toast.error("Workspace not loaded");
                return false;
            }
            const item = workspaceState.items.find((i) => i.id === itemId);
            if (!item) {
                if (!options?.silent) toast.error("Item no longer exists");
                return false;
            }

            if (activeCleanup) {
                activeCleanup();
                activeCleanup = null;
            }

            if (item.folderId) setActiveFolderId(item.folderId);
            else setActiveFolderId(null);

            setTimeout(() => {
                const element = document.getElementById(`item-${itemId}`);
                if (!element) return;

                let container: Element | null = element.parentElement;
                while (container && container !== document.body) {
                    const s = window.getComputedStyle(container);
                    if (s.overflowY === "auto" || s.overflowY === "scroll") break;
                    container = container.parentElement;
                }

                let done = false;
                const clear = () => {
                    if (done) return;
                    done = true;
                    try {
                        element.style.outline = "";
                        element.style.outlineOffset = "";
                        element.style.transition = "";
                    } catch {}
                    activeCleanup = null;
                };
                activeCleanup = clear;

                const addHighlight = () => {
                    if (done) return;
                    try {
                        element.style.transition = "outline-color 0.3s ease-out";
                        element.style.outline = "3px solid rgba(255, 255, 255, 0.8)";
                        element.style.outlineOffset = "2px";
                    } catch {
                        return;
                    }
                    setTimeout(() => {
                        if (done) return;
                        try {
                            element.style.outlineColor = "rgba(255, 255, 255, 0)";
                        } catch {}
                        setTimeout(clear, 300);
                    }, 1000);
                };

                let triggered = false;
                const trigger = () => {
                    if (triggered) return;
                    triggered = true;
                    addHighlight();
                };

                const observer = new IntersectionObserver(
                    (entries) => {
                        for (const e of entries) {
                            if (e.isIntersecting && e.intersectionRatio >= 0.5) {
                                trigger();
                                observer.disconnect();
                                break;
                            }
                        }
                    },
                    { root: container !== document.body ? container : null, threshold: 0.5 }
                );
                observer.observe(element);
                setTimeout(() => {
                    if (!triggered) {
                        trigger();
                        observer.disconnect();
                    }
                }, 1000);

                if (container && container !== document.body) {
                    const rect = element.getBoundingClientRect();
                    const box = container.getBoundingClientRect();
                    container.scrollTo({
                        top:
                            container.scrollTop +
                            rect.top -
                            box.top -
                            container.clientHeight / 2 +
                            element.clientHeight / 2,
                        behavior: "smooth",
                    });
                } else {
                    element.scrollIntoView({ behavior: "smooth", block: "center" });
                }
            }, 50);
            return true;
        },
        [workspaceState?.items, setActiveFolderId]
    );
    return navigateToItem;
}
