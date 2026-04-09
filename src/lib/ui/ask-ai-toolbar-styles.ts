import { cn } from "@/lib/utils";

/**
 * Primary “Ask AI” control — chat selection tooltip, PDF popover, document bubble menu.
 * `selection-tooltip-action` = click target ignored by assistant-thread-selection mouseup.
 */
export const askAiPrimaryButtonClass = cn(
  "selection-tooltip-action inline-flex h-8 shrink-0 cursor-pointer items-center gap-2 rounded-md border-0 px-2.5 text-xs font-medium text-white",
  "shadow-none outline-none ring-0 ring-offset-0 [-webkit-tap-highlight-color:transparent]",
  "focus-visible:outline-none focus-visible:ring-0",
  "bg-blue-600 hover:bg-blue-700",
);
