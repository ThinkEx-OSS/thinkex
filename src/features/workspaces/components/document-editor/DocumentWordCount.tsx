import type { Editor } from "@tiptap/react";

import { Tooltip, TooltipContent, TooltipTrigger } from "#/components/ui/tooltip";
import { useDocumentEditorUiState } from "#/features/workspaces/components/document-editor/document-editor-state";
import {
	workspaceOverlayControlClassName,
	workspaceOverlayLabelClassName,
	workspaceOverlayPillClassNames,
	workspaceOverlayPillSegmentClassName,
	workspaceOverlaySecondaryClassName,
	workspaceOverlaySlashClassName,
} from "#/features/workspaces/components/workspace-overlay-pill";
import { cn } from "#/lib/utils";

export function DocumentWordCount({ editor }: { editor: Editor | null }) {
	const { counts } = useDocumentEditorUiState(editor);
	const hasSelection = counts.selectedWords > 0;
	const label = hasSelection
		? `${counts.selectedWords} of ${counts.totalWords} words selected`
		: `${counts.totalWords} words`;

	return (
		<div className={workspaceOverlayControlClassName}>
			<Tooltip>
				<TooltipTrigger
					aria-label={label}
					render={<span className={cn(workspaceOverlayPillClassNames(), "cursor-default")} />}
				>
					{hasSelection ? (
						<span className={workspaceOverlayPillSegmentClassName}>
							<span className="tabular-nums">{counts.selectedWords}</span>
							<span aria-hidden="true" className={workspaceOverlaySlashClassName}>
								/
							</span>
							<span className={workspaceOverlaySecondaryClassName}>{counts.totalWords}</span>
						</span>
					) : (
						<span className="tabular-nums">{counts.totalWords}</span>
					)}
					<span className={workspaceOverlayLabelClassName}>words</span>
				</TooltipTrigger>
				<TooltipContent>
					{counts.selectedCharacters > 0
						? `${counts.selectedCharacters} / ${counts.totalCharacters} characters`
						: `${counts.totalCharacters} characters`}
				</TooltipContent>
			</Tooltip>
		</div>
	);
}
