/** Shared layout + appearance tokens for workspace item cards. */

/** Footprint of a preview control, shared with the loading skeleton. */
export const workspaceItemPreviewControlSizeClass =
	"size-9 rounded-[6px] sm:size-6 sm:rounded-[4px]";

export const workspaceItemPreviewControlClass = `relative z-20 ${workspaceItemPreviewControlSizeClass} border border-border/80 bg-card/95 text-muted-foreground shadow-none backdrop-blur-md transition-[background-color,border-color,color,opacity] hover:border-foreground/30 hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 dark:border-white/15 dark:bg-card/90 dark:text-muted-foreground dark:hover:border-white/35 dark:hover:bg-secondary dark:hover:text-foreground/95 data-popup-open:border-foreground/30 data-popup-open:bg-secondary data-popup-open:text-foreground dark:data-popup-open:border-white/35 dark:data-popup-open:bg-secondary dark:data-popup-open:text-foreground/95`;

export const workspaceItemPreviewControlOverlayClass =
	"pointer-events-auto opacity-100 transition-opacity sm:pointer-events-none sm:opacity-0 sm:group-hover/item:pointer-events-auto sm:group-hover/item:opacity-100 sm:data-popup-open:pointer-events-auto sm:data-popup-open:opacity-100";

export const workspaceItemPreviewControlSelectedClass =
	"pointer-events-auto border-info bg-info text-white opacity-100 dark:border-info dark:bg-info dark:text-white";

export const workspaceItemPreviewControlRowClass =
	"relative z-10 flex items-center justify-end gap-2 sm:h-10 sm:justify-between sm:gap-1 sm:px-2";

/**
 * Geometry only — a row on mobile, a column on desktop. Split out from the
 * interactive class so the loading skeleton can occupy the exact same box
 * without inheriting drag affordances or the dnd placeholder hook.
 */
export const workspaceItemCardShapeClass =
	"relative flex h-full min-h-20 flex-row gap-0 overflow-hidden py-0 sm:min-h-44 sm:flex-col";

export const workspaceItemCardBaseClass = `workspace-item-card group/item cursor-pointer transition-[background-color,box-shadow] active:cursor-grabbing ${workspaceItemCardShapeClass}`;

export const workspaceItemCardHoverClass = "hover:bg-secondary dark:hover:bg-accent/75";

export const workspaceItemCardUnselectedHoverClass =
	"not-data-[selected=true]:hover:shadow-md not-data-[selected=true]:hover:ring-foreground/15 dark:not-data-[selected=true]:hover:ring-foreground/18";

export const workspaceItemCardSelectedClass =
	"data-[selected=true]:ring-2 data-[selected=true]:ring-info";

/** Text block below (desktop) or beside (mobile) the preview. `pr-24` on mobile
 * is the gutter the absolutely-positioned control pair sits in. */
export const workspaceItemCardHeaderClass =
	"relative z-10 min-w-0 flex-1 self-center justify-start gap-1 py-2 pr-24 pl-3 sm:flex-none sm:shrink-0 sm:self-auto sm:px-3";

export const workspaceItemGridClass =
	"grid grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] sm:gap-5";

export const workspaceItemPreviewStageClass =
	"pointer-events-none relative z-10 w-14 shrink-0 overflow-hidden bg-muted sm:min-h-20 sm:w-auto sm:flex-1";

export const workspaceItemPreviewContentLayerClass = "absolute inset-0";

export const workspaceItemPreviewControlsLayerClass =
	"pointer-events-none absolute top-1/2 right-2 z-20 -translate-y-1/2 sm:inset-x-0 sm:top-0 sm:translate-y-0";

export const workspaceItemDocumentPreviewPanelClass = "size-full overflow-hidden p-3";

export const workspaceItemDocumentPreviewTextClass =
	"size-full overflow-hidden break-words whitespace-pre-line text-[11px] leading-[1.45] text-muted-foreground/70 line-clamp-[11]";

export const workspaceItemPreviewIconClass = "size-8 sm:size-10";
