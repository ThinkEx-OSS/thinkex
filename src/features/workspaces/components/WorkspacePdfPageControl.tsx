import { useScroll } from "@embedpdf/plugin-scroll/react";
import { useState } from "react";
import { useAutoHideControls } from "#/features/workspaces/components/use-auto-hide-overlay";
import { usePdfViewportAutoHide } from "#/features/workspaces/components/use-pdf-viewport-auto-hide";
import {
	workspaceOverlayControlClassName,
	workspaceOverlayPillClassNames,
	workspaceOverlayPillSegmentClassName,
	workspaceOverlaySecondaryClassName,
	workspaceOverlaySlashClassName,
} from "#/features/workspaces/components/workspace-overlay-pill";
import { cn } from "#/lib/utils";

const HIDE_DELAY_MS = 1500;

function clampPageNumber(value: string, fallback: number, totalPages: number) {
	const parsedPage = Number.parseInt(value, 10);

	if (!Number.isFinite(parsedPage)) {
		return fallback;
	}

	return Math.min(Math.max(parsedPage, 1), totalPages);
}

export function WorkspacePdfPageControl({ documentId }: { documentId: string }) {
	const {
		provides: scroll,
		state: { currentPage, totalPages },
	} = useScroll(documentId);
	const [draftPage, setDraftPage] = useState<string | null>(null);
	const { controls, interactionHandlers, isVisible } = useAutoHideControls(HIDE_DELAY_MS);
	const hasPages = totalPages > 0;
	const currentPageNumber = currentPage || 1;
	const inputValue = draftPage ?? String(currentPageNumber);

	usePdfViewportAutoHide(documentId, hasPages, controls);

	function commitPage(value: string) {
		if (!hasPages) {
			return;
		}

		const nextPage = clampPageNumber(value, currentPageNumber, totalPages);

		setDraftPage(null);

		if (nextPage !== currentPageNumber) {
			scroll?.scrollToPage({
				behavior: "auto",
				pageNumber: nextPage,
			});
		}
	}

	if (!hasPages) {
		return null;
	}

	return (
		<div
			className={cn(
				workspaceOverlayControlClassName,
				"transition-opacity duration-200",
				isVisible ? "opacity-100" : "opacity-0",
			)}
		>
			<fieldset
				className={cn(
					workspaceOverlayPillClassNames({ focusable: true }),
					workspaceOverlayPillSegmentClassName,
				)}
				{...interactionHandlers}
			>
				<label className="sr-only" htmlFor={`${documentId}-pdf-page-number`}>
					Page number
				</label>
				<input
					id={`${documentId}-pdf-page-number`}
					inputMode="numeric"
					max={totalPages}
					min={1}
					onBlur={(event) => {
						commitPage(event.currentTarget.value);
					}}
					onChange={(event) => {
						setDraftPage(event.currentTarget.value.replace(/\D/g, ""));
						controls.show();
					}}
					onKeyDown={(event) => {
						if (event.key !== "Enter") {
							return;
						}

						commitPage(event.currentTarget.value);
						event.currentTarget.blur();
					}}
					type="text"
					value={inputValue}
					className="field-sizing-content h-auto min-w-3 max-w-8 border-0 bg-transparent p-0 text-center text-inherit tabular-nums outline-none focus:text-foreground"
				/>
				<span aria-hidden="true" className={workspaceOverlaySlashClassName}>
					/
				</span>
				<span className={workspaceOverlaySecondaryClassName}>{totalPages}</span>
			</fieldset>
		</div>
	);
}
