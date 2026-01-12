import { useMemo } from "react";
import { COLUMN_BREAKPOINTS } from "@/lib/layout-constants";

interface LayoutStateConfig {
  isLeftSidebarOpen: boolean;
  isChatExpanded: boolean;
  workspacePanelSize: number; // percentage (0-100)
  isChatMaximized: boolean;
  isDesktop: boolean;
}

interface LayoutState {
  // Column calculation for workspace grid
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
 * Column calculation:
 * - Mobile: Always 4 columns
 * - Desktop: Always 4 columns (unless chat is maximized)
 */
export function useLayoutState({
  isLeftSidebarOpen,
  isChatExpanded,
  workspacePanelSize,
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

