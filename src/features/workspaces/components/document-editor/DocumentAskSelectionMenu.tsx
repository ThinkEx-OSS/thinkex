import type { Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { useEffect, useState } from "react";

import { WorkspaceAskSelectionButton } from "#/features/workspaces/components/WorkspaceAskSelectionButton";
import { stageComposerQuote } from "#/features/workspaces/composer/workspace-composer-actions";
import { createDocumentSelectedQuote } from "#/features/workspaces/model/workspace-selected-quotes";
import {
	type ClientPoint,
	getPointerClientPoint,
} from "#/features/workspaces/model/workspace-selection-geometry";

const DOCUMENT_ASK_BUBBLE_MENU_PLUGIN_KEY = "documentAskSelectionBubbleMenu";

export function DocumentAskSelectionMenu({
	editor,
	itemId,
	scrollTarget,
	workspaceId,
}: {
	editor: Editor | null;
	itemId: string;
	scrollTarget: HTMLElement | null;
	workspaceId: string;
}) {
	const [selectionPoint, setSelectionPoint] = useState<ClientPoint | null>(null);

	useEffect(() => {
		const element = editor?.view.dom;

		if (!element) {
			return;
		}

		const handlePointerUp = (event: PointerEvent) => {
			setSelectionPoint(getPointerClientPoint(event));
		};
		const clearSelectionPoint = () => {
			setSelectionPoint(null);
		};
		const selectionScrollTarget = scrollTarget ?? window;

		element.addEventListener("pointerup", handlePointerUp, true);
		element.addEventListener("keydown", clearSelectionPoint);
		selectionScrollTarget.addEventListener("scroll", clearSelectionPoint, true);
		window.addEventListener("resize", clearSelectionPoint);

		return () => {
			element.removeEventListener("pointerup", handlePointerUp, true);
			element.removeEventListener("keydown", clearSelectionPoint);
			selectionScrollTarget.removeEventListener("scroll", clearSelectionPoint, true);
			window.removeEventListener("resize", clearSelectionPoint);
		};
	}, [editor, scrollTarget]);

	if (!editor) {
		return null;
	}

	return (
		<BubbleMenu
			className="z-[49]"
			editor={editor}
			pluginKey={DOCUMENT_ASK_BUBBLE_MENU_PLUGIN_KEY}
			resizeDelay={0}
			updateDelay={0}
			options={{
				flip: { fallbackPlacements: ["top"] },
				hide: true,
				inline: selectionPoint ?? true,
				offset: 10,
				placement: "bottom",
				scrollTarget: scrollTarget ?? undefined,
				shift: true,
				strategy: "fixed",
			}}
			shouldShow={({ state, from, to }) =>
				from !== to && Boolean(state.doc.textBetween(from, to, " ").trim())
			}
		>
			<WorkspaceAskSelectionButton
				onClick={() => {
					const { from, to } = editor.state.selection;
					const text = editor.state.doc.textBetween(from, to, " ").trim();

					if (!text || from === to) {
						return;
					}

					stageComposerQuote(
						workspaceId,
						createDocumentSelectedQuote({
							itemId,
							text,
						}),
					);
					editor.chain().setTextSelection(to).blur().run();
					setSelectionPoint(null);
				}}
			/>
		</BubbleMenu>
	);
}
