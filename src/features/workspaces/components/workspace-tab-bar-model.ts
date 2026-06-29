const TAB_MAX_WIDTH = "16rem";
const WORKSPACE_TAB_GAP_WIDTH = "0.25rem";

export const WORKSPACE_TAB_ITEM_CLASS = "flex min-w-0 items-center gap-1";

export function getWorkspaceTabGridStyle(input: {
	tabCount: number;
	lockedTabWidth: number | null;
}) {
	const normalMaxWidth = `calc(${input.tabCount} * ${TAB_MAX_WIDTH})`;

	if (!input.lockedTabWidth) {
		return {
			gridTemplateColumns: `repeat(${input.tabCount}, minmax(0, 1fr))`,
			width: "100%",
			maxWidth: normalMaxWidth,
		};
	}

	const gapCount = Math.max(input.tabCount - 1, 0);
	const lockedWidth = `calc(${input.tabCount} * ${input.lockedTabWidth}px + ${gapCount} * ${WORKSPACE_TAB_GAP_WIDTH})`;

	return {
		gridTemplateColumns: `repeat(${input.tabCount}, minmax(0, ${input.lockedTabWidth}px))`,
		width: lockedWidth,
		maxWidth: lockedWidth,
	};
}
