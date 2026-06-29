import type { DocumentState } from "@embedpdf/core";
import { type PdfPageObject, type Rotation, restoreRect, transformSize } from "@embedpdf/models";
import { useInteractionManagerCapability } from "@embedpdf/plugin-interaction-manager/react";
import type { RenderCapability } from "@embedpdf/plugin-render";
import type { PageLayout } from "@embedpdf/plugin-scroll";
import { useSelectionCapability } from "@embedpdf/plugin-selection/react";
import { useEffect } from "react";
import { WorkspacePdfRegionCaptureOverlay } from "#/features/workspaces/components/WorkspacePdfRegionCaptureOverlay";
import {
	captureOutputScaleFactor,
	clampNumber,
	type WorkspaceRegionRect,
} from "#/features/workspaces/components/workspace-region-capture";

const PDF_CAPTURE_MODE_ID = "pdfCapture";

export interface WorkspacePdfCaptureResult {
	blob: Blob;
	pageIndex: number;
}

interface WorkspacePdfCapturePageOverlayProps {
	active: boolean;
	documentState: DocumentState;
	onCapture: (capture: WorkspacePdfCaptureResult) => void;
	page: PdfPageObject;
	pageLayout: PageLayout;
	renderCapability: Readonly<RenderCapability> | null;
}

export function WorkspacePdfCapturePageOverlay({
	active,
	documentState,
	onCapture,
	page,
	pageLayout,
	renderCapability,
}: WorkspacePdfCapturePageOverlayProps) {
	return (
		<WorkspacePdfRegionCaptureOverlay
			active={active}
			onCapture={async (region) => {
				if (!renderCapability) {
					return;
				}

				const blob = await renderPdfCapture({
					documentState,
					page,
					pageLayout,
					rect: region,
					renderCapability,
				});
				onCapture({ blob, pageIndex: page.index });
			}}
		/>
	);
}

export function WorkspacePdfCaptureInteractionMode({
	documentId,
	isActive,
}: {
	documentId: string;
	isActive: boolean;
}) {
	const { provides: interactionManager } = useInteractionManagerCapability();
	const { provides: selection } = useSelectionCapability();

	useEffect(() => {
		if (!interactionManager) {
			return;
		}

		interactionManager.registerMode({
			cursor: "crosshair",
			exclusive: true,
			id: PDF_CAPTURE_MODE_ID,
			scope: "page",
		});
	}, [interactionManager]);

	useEffect(() => {
		if (!interactionManager) {
			return;
		}

		const interaction = interactionManager.forDocument(documentId);

		if (!isActive) {
			if (interaction.getActiveMode() === PDF_CAPTURE_MODE_ID) {
				interaction.activateDefaultMode();
			}
			return;
		}

		selection?.clear(documentId);
		interaction.activate(PDF_CAPTURE_MODE_ID);

		return () => {
			try {
				if (interaction.getActiveMode() === PDF_CAPTURE_MODE_ID) {
					interaction.activateDefaultMode();
				}
			} catch {
				// The document can be torn down before React effect cleanup runs.
			}
		};
	}, [documentId, interactionManager, isActive, selection]);

	return null;
}

async function renderPdfCapture({
	documentState,
	page,
	pageLayout,
	rect,
	renderCapability,
}: {
	documentState: DocumentState;
	page: PdfPageObject;
	pageLayout: PageLayout;
	rect: WorkspaceRegionRect;
	renderCapability: Readonly<RenderCapability>;
}) {
	const rotation = combineRotations(page.rotation, documentState.rotation);
	const rotatedSize = transformSize(page.size, rotation, 1);
	const scale =
		rotatedSize.width > 0
			? pageLayout.rotatedWidth / rotatedSize.width
			: pageLayout.width / page.size.width;
	const pdfRect = clampRectToPage(restoreRect(page.size, rect, rotation, scale || 1), page);
	const renderScale = (scale || 1) * captureOutputScaleFactor(rect.size.width, rect.size.height);

	return renderCapability
		.renderPageRect({
			options: {
				dpr: 1,
				imageType: "image/png",
				scaleFactor: renderScale,
				withAnnotations: true,
				withForms: true,
			},
			pageIndex: page.index,
			rect: pdfRect,
		})
		.toPromise();
}

function clampRectToPage(rect: WorkspaceRegionRect, page: PdfPageObject): WorkspaceRegionRect {
	const left = clampNumber(rect.origin.x, 0, page.size.width);
	const top = clampNumber(rect.origin.y, 0, page.size.height);
	const right = clampNumber(rect.origin.x + rect.size.width, left, page.size.width);
	const bottom = clampNumber(rect.origin.y + rect.size.height, top, page.size.height);

	return {
		origin: { x: left, y: top },
		size: {
			height: bottom - top,
			width: right - left,
		},
	};
}

function combineRotations(left: Rotation, right: Rotation): Rotation {
	return ((left + right) % 4) as Rotation;
}
