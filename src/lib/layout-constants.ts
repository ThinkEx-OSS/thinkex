/**
 * Layout Constants
 * 
 * Centralized configuration for all layout-related magic numbers.
 * These values control the responsive behavior of the dashboard layout.
 */

// ===== WORKSPACE PANEL SIZES =====
// Workspace panel size as percentage of total width (0-100)
export const WORKSPACE_PANEL_SIZES = {
  /** Full width when chat is collapsed */
  FULL: 100,
  /** Default size when chat is expanded */
  WITH_CHAT: 60,
  /** Size when both chat and thread list are visible */
  WITH_THREAD_LIST: 50,
} as const;

// ===== COLUMN BREAKPOINTS =====
// Workspace panel size thresholds for column calculations
export const COLUMN_BREAKPOINTS = {
  /** Workspace size above this = 3 columns */
  THREE_COLUMNS: 70,
  /** Workspace size above this = 2 columns */
  TWO_COLUMNS: 40,
  /** Below this = 1 column */
} as const;

// ===== AUTO-MAXIMIZE THRESHOLD =====
/** When chat panel is dragged beyond this percentage, auto-maximize */
export const AUTO_MAXIMIZE_THRESHOLD = 75;

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
  CHAT: 40,
  /** Default thread list panel size */
  THREAD_LIST: 15,
  /** Minimum workspace panel size */
  WORKSPACE_MIN: 25,
  /** Minimum chat panel size */
  CHAT_MIN: 30,
  /** Maximum chat panel size (before auto-maximize) */
  CHAT_MAX: 75,
  /** Thread list min size */
  THREAD_LIST_MIN: 12,
  /** Thread list max size */
  THREAD_LIST_MAX: 25,
  /** Ratio of available space given to item panel vs workspace (default 0.6 = 60%) */
  ITEM_PANEL_SPLIT_RATIO: 0.6,
} as const;
