/** Shared layout + appearance tokens for workspace item cards. */

export const workspaceItemPreviewControlClass =
	"relative z-20 size-9 rounded-[6px] border border-border/80 bg-card/95 text-muted-foreground shadow-none backdrop-blur-md transition-[background-color,border-color,color,opacity] hover:border-foreground/30 hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 dark:border-white/15 dark:bg-card/90 dark:text-muted-foreground dark:hover:border-white/35 dark:hover:bg-secondary dark:hover:text-foreground/95 data-popup-open:border-foreground/30 data-popup-open:bg-secondary data-popup-open:text-foreground dark:data-popup-open:border-white/35 dark:data-popup-open:bg-secondary dark:data-popup-open:text-foreground/95 sm:size-6 sm:rounded-[4px]";

export const workspaceItemPreviewControlOverlayClass =
	"pointer-events-auto opacity-100 transition-opacity sm:pointer-events-none sm:opacity-0 sm:group-hover/item:pointer-events-auto sm:group-hover/item:opacity-100 sm:data-popup-open:pointer-events-auto sm:data-popup-open:opacity-100";

export const workspaceItemPreviewControlSelectedClass =
	"pointer-events-auto border-info bg-info text-white opacity-100 dark:border-info dark:bg-info dark:text-white";

export const workspaceItemPreviewControlRowClass =
	"relative z-10 flex items-center justify-end gap-2 sm:h-10 sm:justify-between sm:gap-1 sm:px-2";

export const workspaceItemCardBaseClass =
	"workspace-item-card group/item relative flex h-full min-h-20 cursor-pointer flex-row gap-0 overflow-hidden py-0 transition-[background-color,box-shadow] active:cursor-grabbing sm:min-h-44 sm:flex-col";

export const workspaceItemCardHoverClass = "hover:bg-secondary dark:hover:bg-accent/75";

export const workspaceItemCardUnselectedHoverClass =
	"not-data-[selected=true]:hover:shadow-md not-data-[selected=true]:hover:ring-foreground/15 dark:not-data-[selected=true]:hover:ring-foreground/18";

export const workspaceItemCardSelectedClass =
	"data-[selected=true]:ring-2 data-[selected=true]:ring-info";

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
