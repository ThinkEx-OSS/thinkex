import { useMemo } from "react";

interface LayoutStateConfig {
  isLeftSidebarOpen: boolean;
  isChatExpanded: boolean;
  isChatMaximized: boolean;
  isDesktop: boolean;
}

interface LayoutState {
  /** Workspace grid column count (0 when chat is maximized) */
  columns: number;

  // Sidebar states (passed through for convenience)
  isLeftSidebarOpen: boolean;
  isRightSidebarOpen: boolean;
}

/**
 * Centralized layout state manager
 * 
 * Two distinct layout modes:
 * 1. MAXIMIZED: Chat takes full screen, workspace completely hidden (0 columns)
 * 2. NORMAL: Workspace visible with 4 columns
 * 
 * Column count:
 * - Maximized chat: 0 (workspace hidden)
 * - Otherwise: 4 columns
 */
export function useLayoutState({
  isLeftSidebarOpen,
  isChatExpanded,
  isChatMaximized,
  isDesktop,
}: LayoutStateConfig): LayoutState {
  // Calculate workspace columns
  const columns = useMemo(() => {
    // MAXIMIZED MODE: Workspace is hidden, no columns needed
    if (isChatMaximized) {
      return 0;
    }

    // Always use 4 columns
    return 4;
  }, [isChatMaximized]);

  // Right sidebar is open when chat is expanded and not maximized
  const isRightSidebarOpen = isDesktop && isChatExpanded && !isChatMaximized;

  return {
    columns,
    isLeftSidebarOpen,
    isRightSidebarOpen,
  };
}

