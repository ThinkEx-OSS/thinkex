const workspaceToolbarButtonSizeClass = "size-8.5";

const workspaceToolbarIconButtonClass = `${workspaceToolbarButtonSizeClass} justify-center px-0 text-muted-foreground hover:text-foreground aria-expanded:text-foreground [&_svg:not([class*='size-'])]:size-4`;

const workspaceToolbarTextButtonClass =
	"h-8.5 gap-1.5 px-2.5 text-sm text-muted-foreground hover:text-foreground [&_svg:not([class*='size-'])]:size-4";

const workspaceToolbarGroupClassName = "flex items-center gap-0.5";

const workspaceToolbarScrollGroupClassName =
	"flex max-w-full min-w-0 items-center gap-0.5 overflow-x-auto";

export {
	workspaceToolbarButtonSizeClass,
	workspaceToolbarGroupClassName,
	workspaceToolbarIconButtonClass,
	workspaceToolbarScrollGroupClassName,
	workspaceToolbarTextButtonClass,
};
