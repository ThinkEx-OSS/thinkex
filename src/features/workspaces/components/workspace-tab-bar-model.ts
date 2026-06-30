import type { CSSProperties } from "react";

const TAB_MAX_WIDTH = "16rem";
const WORKSPACE_TAB_GAP_WIDTH = "0.25rem";

export const WORKSPACE_TAB_ITEM_CLASS = "flex min-w-0 flex-1 basis-0 items-center";

export function getWorkspaceTabListStyle(input: {
	tabCount: number;
	lockedTabWidth: number | null;
}): CSSProperties {
	const normalMaxWidth = `calc(${input.tabCount} * ${TAB_MAX_WIDTH})`;

	if (!input.lockedTabWidth) {
		return {
			width: "100%",
			maxWidth: normalMaxWidth,
		};
	}

	const gapCount = Math.max(input.tabCount - 1, 0);
	const lockedWidth = `calc(${input.tabCount} * ${input.lockedTabWidth}px + ${gapCount} * ${WORKSPACE_TAB_GAP_WIDTH})`;

	return {
		width: lockedWidth,
		maxWidth: lockedWidth,
	};
}

export function getWorkspaceTabItemStyle(input: { lockedTabWidth: number | null }): CSSProperties {
	if (!input.lockedTabWidth) {
		return {
			flex: "1 1 0",
			maxWidth: TAB_MAX_WIDTH,
		};
	}

	return {
		flex: `0 0 ${input.lockedTabWidth}px`,
		maxWidth: input.lockedTabWidth,
	};
}
