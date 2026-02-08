"use client";

import { useCallback } from "react";
import { useUIStore } from "@/lib/stores/ui-store";
import { useWorkspaceStore } from "@/lib/stores/workspace-store";
import { useWorkspaceState } from "@/hooks/workspace/use-workspace-state";
import { toast } from "sonner";
import { getFolderPath } from "@/lib/workspace-state/search";

/**
 * Hook that provides a function to navigate to and highlight an item in the workspace.
 * This replicates the behavior of clicking an item in the workspace sidebar.
 * 
 * The function will:
 * 1. If the item is in a folder, set that folder as active.
 * 2. If the item is NOT in a folder, clear the active folder.
 * 3. Scroll to the item's card in the workspace grid.
 * 4. Add a temporary highlight border to the card.
 * 
 * Returns false if the item doesn't exist, true otherwise.
 */
export function useNavigateToItem() {
    const workspaceId = useWorkspaceStore((state) => state.currentWorkspaceId);
    const { state: workspaceState } = useWorkspaceState(workspaceId);
    const setActiveFolderId = useUIStore((state) => state.setActiveFolderId);
    const clearActiveFolder = useUIStore((state) => state.clearActiveFolder);

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

            // If item is in a folder, set the folder as active so it's visible in the main view
            if (item.folderId) {
                setActiveFolderId(item.folderId);
            } else {
                // If item is in root, clear any active folder
                clearActiveFolder();
            }

            // Small delay to let the DOM update (folder filter and scroll)
            setTimeout(() => {
                const element = document.getElementById(`item-${itemId}`);
                if (!element) {
                    // Element not found after folder switch - likely doesn't exist in DOM
                    // The scroll logic won't work, so we should stop here
                    return;
                }

                // Find the scrollable container
                let container = element.parentElement;
                while (container && container !== document.body) {
                    const style = window.getComputedStyle(container);
                    if (style.overflowY === "auto" || style.overflowY === "scroll") {
                        break;
                    }
                    container = container.parentElement;
                }

                // Function to add temporary highlight after scroll ends
                const addHighlight = () => {
                    // Store original border styles
                    const originalBorder = element.style.border;
                    const originalBorderColor = element.style.borderColor;
                    const originalBorderWidth = element.style.borderWidth;
                    const originalBorderRadius = element.style.borderRadius;

                    // Add highlight border with smooth animation (white, like selection)
                    element.style.transition =
                        "border-color 0.3s ease-out, border-width 0.2s ease-out";
                    element.style.borderColor = "rgba(255, 255, 255, 0.8)";
                    element.style.borderWidth = "3px";
                    element.style.borderRadius = "0.375rem"; // rounded-md (6px)

                    // Remove highlight after 1 second with fade out
                    setTimeout(() => {
                        element.style.borderColor = "rgba(255, 255, 255, 0)";
                        // Restore original styles after transition completes
                        setTimeout(() => {
                            element.style.border = originalBorder;
                            element.style.borderColor = originalBorderColor;
                            element.style.borderWidth = originalBorderWidth;
                            element.style.borderRadius = originalBorderRadius;
                            element.style.transition = "";
                        }, 300);
                    }, 1000);
                };

                let highlightTriggered = false;

                const triggerHighlight = () => {
                    if (highlightTriggered) return;
                    highlightTriggered = true;
                    addHighlight();
                };

                // Use IntersectionObserver to detect when element is visible
                const observer = new IntersectionObserver(
                    (entries) => {
                        entries.forEach((entry) => {
                            if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
                                triggerHighlight();
                                observer.disconnect();
                            }
                        });
                    },
                    {
                        root: container !== document.body ? container : null,
                        threshold: 0.5, // Trigger when 50% visible
                    }
                );

                // Start observing
                observer.observe(element);

                // Fallback timeout in case observer doesn't fire (edge cases)
                setTimeout(() => {
                    if (!highlightTriggered) {
                        triggerHighlight();
                        observer.disconnect();
                    }
                }, 1000);

                if (container && container !== document.body) {
                    const elementRect = element.getBoundingClientRect();
                    const containerRect = container.getBoundingClientRect();
                    const relativeTop = elementRect.top - containerRect.top;

                    container.scrollTo({
                        top:
                            container.scrollTop +
                            relativeTop -
                            container.clientHeight / 2 +
                            element.clientHeight / 2,
                        behavior: "smooth",
                    });
                } else {
                    element.scrollIntoView({ behavior: "smooth", block: "center" });
                }
            }, 50); // Small delay to let the DOM update (folder filter and scroll)

            return true;
        },
        [workspaceState?.items, setActiveFolderId, clearActiveFolder]
    );

    return navigateToItem;
}
