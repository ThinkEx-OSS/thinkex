
import { useState, useEffect, useCallback } from "react";
import { useNavigateToItem } from "./use-navigate-to-item";
import type { AgentState } from "@/lib/workspace-state/types";

/**
 * Hook to handle navigation after item creation.
 * It waits for the item to appear in the workspace state before attempting to scroll to it,
 * solving race conditions and stale closure issues.
 */
export function useReactiveNavigation(workspaceState: AgentState) {
    const [pendingNavigationId, setPendingNavigationId] = useState<string | null>(null);
    const navigateToItem = useNavigateToItem();

    const handleCreatedItems = useCallback((createdIds: string[]) => {
        // Set pending navigation to trigger in useEffect once item is available in state
        if (createdIds.length > 0) {
            setPendingNavigationId(createdIds[0]);
        }
    }, []);

    // Effect to handle navigation once item appears in state
    useEffect(() => {
        if (pendingNavigationId && workspaceState?.items) {
            const itemExists = workspaceState.items.some(i => i.id === pendingNavigationId);
            if (itemExists) {
                // Slight delay to ensure DOM is ready (grid layout positioning)
                setTimeout(() => {
                    navigateToItem(pendingNavigationId);
                    setPendingNavigationId(null);
                }, 50);
            }
        }
    }, [workspaceState?.items, pendingNavigationId, navigateToItem]);

    return { handleCreatedItems };
}
