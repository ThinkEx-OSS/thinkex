import {
	type SelectionSelectionMenuProps,
	useSelectionCapability,
} from "@embedpdf/plugin-selection/react";
import { useState } from "react";

import { WorkspaceAskSelectionButton } from "#/features/workspaces/components/WorkspaceAskSelectionButton";
import { stageComposerQuote } from "#/features/workspaces/composer/workspace-composer-actions";
import { createPdfSelectedQuote } from "#/features/workspaces/model/workspace-selected-quotes";
import { type ClientPoint, clamp } from "#/features/workspaces/model/workspace-selection-geometry";

const PDF_ASK_SELECTION_MENU_HEIGHT = 40;
const PDF_ASK_SELECTION_MENU_WIDTH = 78;
const PDF_ASK_SELECTION_MENU_GAP = 2;

export function WorkspacePdfAskSelectionMenu({
	documentId,
	itemId,
	menuWrapperProps,
	placement,
	rect,
	selectionPoint,
	workspaceId,
}: SelectionSelectionMenuProps & {
	documentId: string;
	itemId: string;
	selectionPoint: ClientPoint | null;
	workspaceId: string;
}) {
	const [menuWrapperElement, setMenuWrapperElement] = useState<HTMLDivElement | null>(null);
	const { provides: selectionCapability } = useSelectionCapability();
	const setMenuWrapperRef = (element: HTMLDivElement | null) => {
		menuWrapperProps.ref(element);
		setMenuWrapperElement((current) => (current === element ? current : element));
	};
	const isTopPlacement = placement.suggestTop;
	const sideSpace = isTopPlacement ? placement.spaceAbove : placement.spaceBelow;
	const wrapperRect = menuWrapperElement?.getBoundingClientRect();
	const localSelectionX =
		selectionPoint && wrapperRect ? selectionPoint.x - wrapperRect.left : rect.size.width / 2;
	const left = clamp(
		localSelectionX,
		PDF_ASK_SELECTION_MENU_WIDTH / 2,
		rect.size.width - PDF_ASK_SELECTION_MENU_WIDTH / 2,
	);
	const top = isTopPlacement
		? -(PDF_ASK_SELECTION_MENU_HEIGHT + PDF_ASK_SELECTION_MENU_GAP)
		: rect.size.height + PDF_ASK_SELECTION_MENU_GAP;

	if (
		sideSpace !== undefined &&
		sideSpace < PDF_ASK_SELECTION_MENU_HEIGHT + PDF_ASK_SELECTION_MENU_GAP
	) {
		return null;
	}

	return (
		<div {...menuWrapperProps} ref={setMenuWrapperRef}>
			<div
				className="absolute z-[49] -translate-x-1/2"
				style={{
					cursor: "default",
					left,
					pointerEvents: "auto",
					top,
				}}
			>
				<WorkspaceAskSelectionButton
					onClick={() => {
						void (async () => {
							const selection = selectionCapability?.forDocument(documentId);

							if (!selection) {
								return;
							}

							let text = "";

							try {
								text = await readPdfSelectedText(selection.getSelectedText());
							} catch (error) {
								console.warn(
									"[WorkspacePdfAskSelectionMenu] Failed to read selected PDF text",
									error,
								);
								return;
							}

							if (!text) {
								return;
							}

							const pageNumbers = Array.from(
								new Set(selection.getFormattedSelection().map((item) => item.pageIndex + 1)),
							).sort((left, right) => left - right);

							stageComposerQuote(
								workspaceId,
								createPdfSelectedQuote({
									itemId,
									pageNumbers,
									text,
								}),
							);
							selection.clear();
						})();
					}}
				/>
			</div>
		</div>
	);
}

type PdfSelectedTextTask = {
	wait: (onSuccess: (lines: string[]) => void, onError: (error: unknown) => void) => void;
};

function readPdfSelectedText(task: PdfSelectedTextTask) {
	return new Promise<string>((resolve, reject) => {
		task.wait(
			(lines) => resolve(lines.join("\n").trim()),
			(error) => reject(error),
		);
	});
}
