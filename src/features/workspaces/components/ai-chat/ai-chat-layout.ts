export const aiChatComposerRailClassName = "mx-auto w-full max-w-3xl";
// The composer's shell and its internal paddings. Anything that takes the
// composer's slot — today the question card — is built from these same values,
// so it reads as the composer changing its contents rather than a different
// surface appearing in its place. (The question card cannot literally render
// inside the composer: both are <form> elements and nesting forms is invalid.)
export const aiChatComposerGroupClassName =
	"h-auto flex-col border-border/70 bg-muted/30 shadow-none dark:bg-muted/30";
export const aiChatComposerInlinePadding = "px-3.5";
// gap-0: every header row self-pads (pt on its content), so the always-mounted
// zero-height reveal wrappers add no phantom flex gaps to an idle composer.
export const aiChatComposerHeaderPadding = "gap-0 px-3.5 pb-1";
export const aiChatComposerFooterPadding = "pl-2 pr-3.5 pt-1 pb-2";
export const aiChatMessageRailClassName = "mx-auto w-full max-w-3xl";
export const aiChatMessageScrollerContentClassName = "gap-5 px-4 pt-12 pb-5";
