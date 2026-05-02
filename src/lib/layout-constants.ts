/**
 * Layout Constants
 * 
 * Centralized configuration for all layout-related magic numbers.
 * These values control the responsive behavior of the workspace layout.
 */

// ===== SIDEBAR WIDTHS =====
/** Left sidebar width when expanded (Tailwind class value) */
export const LEFT_SIDEBAR_WIDTH_EXPANDED = '16rem'; // 256px
/** Left sidebar width when collapsed (Tailwind class value) */
export const LEFT_SIDEBAR_WIDTH_COLLAPSED = '3rem'; // 48px
/** Thread list width (Tailwind class value) */
export const THREAD_LIST_WIDTH = '16rem'; // 256px

// ===== RESIZABLE PANEL DEFAULTS =====
export const PANEL_DEFAULTS = {
  /** Default workspace panel size when chat is expanded */
  WORKSPACE_WITH_CHAT: 60,
  /** Default chat panel size */
  CHAT: 30.5,
  /** Default thread list panel size */
  THREAD_LIST: 15,
  /** Minimum workspace panel size */
  WORKSPACE_MIN: 25,
  /** Minimum chat panel size */
  CHAT_MIN: 30,
  /** Maximum chat panel width in split view (percentage of group) */
  CHAT_MAX: 75,
  /** Thread list min size */
  THREAD_LIST_MIN: 12,
  /** Thread list max size */
  THREAD_LIST_MAX: 25,
  /** Ratio of available space given to item panel vs workspace (default 0.6 = 60% panel, 40% workspace) */
  ITEM_PANEL_SPLIT_RATIO: 0.6,
} as const;
