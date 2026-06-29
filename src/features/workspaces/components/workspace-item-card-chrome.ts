/** Shared layout + appearance tokens for workspace item cards. */

export const workspaceItemPreviewControlClass =
	"relative z-20 rounded-[4px] border border-border/80 bg-card/95 text-muted-foreground shadow-none backdrop-blur-md transition-[background-color,border-color,color,opacity] hover:border-foreground/30 hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 dark:border-white/15 dark:bg-card/90 dark:text-muted-foreground dark:hover:border-white/35 dark:hover:bg-secondary dark:hover:text-foreground/95 data-popup-open:border-foreground/30 data-popup-open:bg-secondary data-popup-open:text-foreground dark:data-popup-open:border-white/35 dark:data-popup-open:bg-secondary dark:data-popup-open:text-foreground/95";

export const workspaceItemPreviewControlOverlayClass =
	"pointer-events-none opacity-0 transition-opacity group-hover/item:pointer-events-auto group-hover/item:opacity-100 data-popup-open:pointer-events-auto data-popup-open:opacity-100";

export const workspaceItemPreviewControlSelectedClass =
	"pointer-events-auto border-info bg-info text-white opacity-100 dark:border-info dark:bg-info dark:text-white";

export const workspaceItemPreviewControlRowClass =
	"relative z-10 flex h-10 items-center justify-between px-2";

export const workspaceItemCardBaseClass =
	"workspace-item-card group/item relative flex h-full min-h-44 cursor-pointer flex-col gap-0 overflow-hidden py-0 transition-[background-color,box-shadow] active:cursor-grabbing";

export const workspaceItemCardHoverClass = "hover:bg-secondary dark:hover:bg-accent/75";

export const workspaceItemCardUnselectedHoverClass =
	"not-data-[selected=true]:hover:shadow-md not-data-[selected=true]:hover:ring-foreground/15 dark:not-data-[selected=true]:hover:ring-foreground/18";

export const workspaceItemCardSelectedClass =
	"data-[selected=true]:ring-2 data-[selected=true]:ring-info";

export const workspaceItemGridClass = "grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-5";

export const workspaceItemPreviewStageClass =
	"pointer-events-none relative z-10 min-h-20 flex-1 overflow-hidden bg-muted";

export const workspaceItemPreviewContentLayerClass = "absolute inset-0";

export const workspaceItemPreviewControlsLayerClass = "absolute inset-x-0 top-0 z-20";

export const workspaceItemDocumentPreviewPanelClass = "size-full overflow-hidden p-3";

export const workspaceItemDocumentPreviewTextClass =
	"size-full overflow-hidden break-words whitespace-pre-line text-[11px] leading-[1.45] text-muted-foreground/70 line-clamp-[11]";

export const workspaceItemPreviewIconClass = "size-10";
