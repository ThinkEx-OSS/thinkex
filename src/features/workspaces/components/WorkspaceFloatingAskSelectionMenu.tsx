import { createPortal } from "react-dom";

import { WorkspaceAskSelectionButton } from "#/features/workspaces/components/WorkspaceAskSelectionButton";
import {
	type ClientPoint,
	getBottomPreferredSelectionMenuPlacement,
	type SelectionRect,
} from "#/features/workspaces/model/workspace-selection-geometry";
import { cn } from "#/lib/utils";

const ASK_SELECTION_MENU_HEIGHT = 32;
const ASK_SELECTION_MENU_WIDTH = 78;
const ASK_SELECTION_MENU_OFFSET = 8;
const ASK_SELECTION_MENU_VIEWPORT_MARGIN = 8;
const ASK_SELECTION_MENU_LAYER_CLASSNAME = "z-[49]";

export function WorkspaceFloatingAskSelectionMenu({
	className,
	onAsk,
	point,
	rect,
}: {
	className?: string;
	onAsk: () => void;
	point?: ClientPoint | null;
	rect: SelectionRect;
}) {
	if (typeof document === "undefined" || typeof window === "undefined") {
		return null;
	}

	const placement = getBottomPreferredSelectionMenuPlacement({
		menu: {
			height: ASK_SELECTION_MENU_HEIGHT,
			offset: ASK_SELECTION_MENU_OFFSET,
			viewportMargin: ASK_SELECTION_MENU_VIEWPORT_MARGIN,
			width: ASK_SELECTION_MENU_WIDTH,
		},
		point,
		rect,
		viewport: {
			height: window.innerHeight,
			width: window.innerWidth,
		},
	});

	return createPortal(
		<div
			className={cn("fixed", ASK_SELECTION_MENU_LAYER_CLASSNAME, className)}
			style={{
				left: placement.left,
				top: placement.top,
				transform: "translateX(-50%)",
			}}
		>
			<WorkspaceAskSelectionButton onClick={onAsk} />
		</div>,
		document.body,
	);
}
