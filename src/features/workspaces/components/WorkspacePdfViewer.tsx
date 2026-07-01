import { createPluginRegistration, type DocumentState } from "@embedpdf/core";
import { EmbedPDF, type PluginBatchRegistrations } from "@embedpdf/core/react";
import { useEngineContext } from "@embedpdf/engines/react";
import {
	AnnotationLayer,
	AnnotationPluginPackage,
	LockModeType,
} from "@embedpdf/plugin-annotation/react";
import {
	DocumentContent,
	DocumentManagerPluginPackage,
	useDocumentManagerCapability,
} from "@embedpdf/plugin-document-manager/react";
import {
	InteractionManagerPluginPackage,
	PagePointerProvider,
} from "@embedpdf/plugin-interaction-manager/react";
import type { RenderCapability } from "@embedpdf/plugin-render";
import {
	RenderLayer,
	RenderPluginPackage,
	useRenderCapability,
} from "@embedpdf/plugin-render/react";
import { Rotate, RotatePluginPackage } from "@embedpdf/plugin-rotate/react";
import {
	type PageLayout,
	Scroller,
	ScrollPluginPackage,
	ScrollStrategy,
	useScroll,
} from "@embedpdf/plugin-scroll/react";
import {
	SelectionPluginPackage,
	TextSelection,
	useSelectionCapability,
} from "@embedpdf/plugin-selection/react";
import { TilingLayer, TilingPluginPackage } from "@embedpdf/plugin-tiling/react";
import { Viewport, ViewportPluginPackage } from "@embedpdf/plugin-viewport/react";
import { ZoomGestureWrapper, ZoomMode, ZoomPluginPackage } from "@embedpdf/plugin-zoom/react";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { Spinner } from "#/components/ui/spinner";
import {
	WorkspaceCaptureShortcuts,
	WorkspaceCaptureViewerFrame,
} from "#/features/workspaces/components/WorkspaceCaptureChrome";
import { useFileItemToolbar } from "#/features/workspaces/components/WorkspaceItemToolbarSlot";
import { useWorkspacePaneHotkey } from "#/features/workspaces/components/WorkspacePaneRuntime";
import { WorkspacePdfAskSelectionMenu } from "#/features/workspaces/components/WorkspacePdfAskSelectionMenu";
import {
	WorkspacePdfCaptureInteractionMode,
	WorkspacePdfCapturePageOverlay,
	type WorkspacePdfCaptureResult,
} from "#/features/workspaces/components/WorkspacePdfCapture";
import { WorkspacePdfPageControl } from "#/features/workspaces/components/WorkspacePdfPageControl";
import { useWorkspaceViewCapabilities } from "#/features/workspaces/components/workspace-view-policy";
import { createCaptureAttachmentFile } from "#/features/workspaces/components/workspace-region-capture";
import { stageCaptureAttachmentToComposerWithFeedback } from "#/features/workspaces/composer/workspace-composer-actions";
import type { WorkspaceItem } from "#/features/workspaces/model/types";
import { getWorkspaceFileContentUrl } from "#/features/workspaces/model/workspace-file";
import {
	type ClientPoint,
	getPointerClientPoint,
} from "#/features/workspaces/model/workspace-selection-geometry";
import { useWorkspaceUiStore } from "#/features/workspaces/state/workspace-ui-store";

const pdfPlugins: PluginBatchRegistrations = [
	createPluginRegistration(DocumentManagerPluginPackage, {
		maxDocuments: 1,
	}),
	createPluginRegistration(ViewportPluginPackage, {
		viewportGap: 0,
	}),
	createPluginRegistration(ScrollPluginPackage, {
		defaultStrategy: ScrollStrategy.Vertical,
	}),
	createPluginRegistration(InteractionManagerPluginPackage),
	createPluginRegistration(SelectionPluginPackage, {
		marquee: {
			enabled: false,
		},
	}),
	createPluginRegistration(AnnotationPluginPackage, {
		locked: { type: LockModeType.All },
	}),
	createPluginRegistration(ZoomPluginPackage, {
		defaultZoomLevel: ZoomMode.FitWidth,
	}),
	createPluginRegistration(RotatePluginPackage),
	createPluginRegistration(RenderPluginPackage),
	createPluginRegistration(TilingPluginPackage, {
		extraRings: 0,
		overlapPx: 2.5,
		tileSize: 768,
	}),
];

type WorkspacePdfInteractions = {
	fileCapture: boolean;
	selectionMenu: boolean;
	textSelection: boolean;
};

export default function WorkspacePdfViewer({
	item,
	toolbarSlotId,
	workspaceId,
}: {
	item: WorkspaceItem;
	toolbarSlotId?: string;
	workspaceId: string;
}) {
	const fileUrl = getWorkspaceFileContentUrl(workspaceId, item.id);
	const { engine, error, isLoading } = useEngineContext();
	const [isCaptureActive, setIsCaptureActive] = useState(false);
	const viewCapabilities = useWorkspaceViewCapabilities();
	const enableFileCapture = viewCapabilities.fileCapture;
	const captureActive = enableFileCapture && isCaptureActive;
	const exitCapture = useCallback(() => {
		setIsCaptureActive(false);
	}, []);
	const toggleCapture = useCallback(() => {
		setIsCaptureActive((current) => !current);
	}, []);

	useFileItemToolbar({
		capture: enableFileCapture
			? {
					isActive: captureActive,
					onToggle: toggleCapture,
				}
			: undefined,
		fileName: item.name,
		fileUrl,
		slotId: toolbarSlotId ?? item.id,
	});

	return (
		<div className="pdf-scrollbar relative h-full min-h-0 overflow-hidden bg-background">
			{error ? (
				<WorkspacePdfLoadFailure fileName={item.name} fileUrl={fileUrl}>
					Could not load the PDF engine.
				</WorkspacePdfLoadFailure>
			) : isLoading || !engine ? (
				<WorkspacePdfViewerStatus>Loading PDF viewer...</WorkspacePdfViewerStatus>
			) : (
				<EmbedPDF key={fileUrl} engine={engine} plugins={pdfPlugins}>
					{({ activeDocumentId, pluginsReady }) =>
						pluginsReady ? (
							<WorkspacePdfDocumentLoader
								activeDocumentId={activeDocumentId}
								documentId={item.id}
								fileName={item.name}
								fileUrl={fileUrl}
								isCaptureActive={captureActive}
								itemId={item.id}
								onCaptureModeExit={exitCapture}
								onCaptureModeToggle={toggleCapture}
								workspaceId={workspaceId}
							/>
						) : (
							<WorkspacePdfViewerStatus>Preparing document...</WorkspacePdfViewerStatus>
						)
					}
				</EmbedPDF>
			)}
			{enableFileCapture ? <WorkspaceCaptureViewerFrame active={captureActive} /> : null}
		</div>
	);
}

function WorkspacePdfDocumentLoader({
	activeDocumentId,
	documentId,
	fileName,
	fileUrl,
	isCaptureActive,
	itemId,
	onCaptureModeExit,
	onCaptureModeToggle,
	workspaceId,
}: {
	activeDocumentId: string | null;
	documentId: string;
	fileName: string;
	fileUrl: string;
	isCaptureActive: boolean;
	itemId: string;
	onCaptureModeExit: () => void;
	onCaptureModeToggle: () => void;
	workspaceId: string;
}) {
	const { provides: documentManager } = useDocumentManagerCapability();
	const [openError, setOpenError] = useState<{
		documentId: string;
		message: string;
	} | null>(null);
	const currentOpenError = openError?.documentId === documentId ? openError.message : null;

	useEffect(() => {
		if (!documentManager || documentManager.isDocumentOpen(documentId)) {
			return;
		}

		let cancelled = false;

		const task = documentManager.openDocumentUrl({
			autoActivate: true,
			documentId,
			name: fileName,
			requestOptions: {
				credentials: "same-origin",
			},
			url: fileUrl,
		});

		task.wait(
			() => {
				if (cancelled) {
					return;
				}
			},
			(error) => {
				if (cancelled) {
					return;
				}

				const message =
					error instanceof Error
						? error.message
						: typeof error === "object" && error && "message" in error
							? String(error.message)
							: "Unable to open PDF";

				setOpenError({ documentId, message });
			},
		);

		return () => {
			cancelled = true;
		};
	}, [documentId, documentManager, fileName, fileUrl]);

	if (currentOpenError) {
		return (
			<WorkspacePdfLoadFailure fileName={fileName} fileUrl={fileUrl}>
				Could not load this PDF.
			</WorkspacePdfLoadFailure>
		);
	}

	if (!activeDocumentId) {
		return <WorkspacePdfViewerStatus>Preparing document...</WorkspacePdfViewerStatus>;
	}

	return (
		<DocumentContent documentId={activeDocumentId}>
			{(props) => (
				<WorkspacePdfDocumentContent
					documentId={activeDocumentId}
					fileName={fileName}
					fileUrl={fileUrl}
					isCaptureActive={isCaptureActive}
					itemId={itemId}
					onCaptureModeExit={onCaptureModeExit}
					onCaptureModeToggle={onCaptureModeToggle}
					workspaceId={workspaceId}
					{...props}
				/>
			)}
		</DocumentContent>
	);
}

function WorkspacePdfDocumentContent({
	documentId,
	documentState,
	fileName,
	fileUrl,
	isCaptureActive,
	isError,
	isLoaded,
	isLoading,
	itemId,
	onCaptureModeExit,
	onCaptureModeToggle,
	workspaceId,
}: {
	documentId: string;
	documentState: DocumentState;
	fileName: string;
	fileUrl: string;
	isCaptureActive: boolean;
	isError: boolean;
	isLoaded: boolean;
	isLoading: boolean;
	itemId: string;
	onCaptureModeExit: () => void;
	onCaptureModeToggle: () => void;
	workspaceId: string;
}) {
	const [selectionPoint, setSelectionPoint] = useState<ClientPoint | null>(null);
	const { provides: renderCapability } = useRenderCapability();
	const viewCapabilities = useWorkspaceViewCapabilities();
	const interactions: WorkspacePdfInteractions = {
		fileCapture: viewCapabilities.fileCapture,
		selectionMenu: viewCapabilities.pdfTextSelection && viewCapabilities.contextMenus,
		textSelection: viewCapabilities.pdfTextSelection,
	};

	const handleCapture = ({ blob, pageIndex }: WorkspacePdfCaptureResult) => {
		stageCaptureAttachmentToComposerWithFeedback(
			workspaceId,
			createCaptureAttachmentFile({
				blob,
				fileName,
				suffix: `page-${pageIndex + 1}-capture`,
			}),
		);
	};

	if (isLoading) {
		return <WorkspacePdfViewerStatus>Loading document...</WorkspacePdfViewerStatus>;
	}

	if (isError) {
		return (
			<WorkspacePdfLoadFailure fileName={fileName} fileUrl={fileUrl}>
				Could not load this PDF.
			</WorkspacePdfLoadFailure>
		);
	}

	if (!isLoaded) {
		return <WorkspacePdfViewerStatus>Preparing document...</WorkspacePdfViewerStatus>;
	}

	return (
		<Viewport className="h-full w-full" documentId={documentId}>
			<WorkspacePdfItemViewStateReporter
				documentId={documentId}
				itemId={itemId}
				workspaceId={workspaceId}
			/>
			<WorkspacePdfSelectionShortcuts documentId={documentId} />
			{interactions.fileCapture ? (
				<>
					<WorkspaceCaptureShortcuts
						isActive={isCaptureActive}
						onExit={onCaptureModeExit}
						onToggle={onCaptureModeToggle}
					/>
					<WorkspacePdfCaptureInteractionMode documentId={documentId} isActive={isCaptureActive} />
				</>
			) : null}
			<ZoomGestureWrapper
				className="min-h-full"
				documentId={documentId}
				enablePinch
				enableWheel
				onPointerUpCapture={(event) => {
					setSelectionPoint(getPointerClientPoint(event));
				}}
			>
				<Scroller
					documentId={documentId}
					renderPage={(pageLayout) => (
						<WorkspacePdfPage
							documentId={documentId}
							documentState={documentState}
							isCaptureActive={isCaptureActive}
							itemId={itemId}
							onCapture={handleCapture}
							pageLayout={pageLayout}
							renderCapability={renderCapability}
							selectionPoint={selectionPoint}
							interactions={interactions}
							workspaceId={workspaceId}
						/>
					)}
				/>
			</ZoomGestureWrapper>
			<WorkspacePdfPageControl documentId={documentId} />
		</Viewport>
	);
}

function WorkspacePdfPage({
	documentId,
	documentState,
	interactions,
	isCaptureActive,
	itemId,
	onCapture,
	pageLayout,
	renderCapability,
	selectionPoint,
	workspaceId,
}: {
	documentId: string;
	documentState: DocumentState;
	interactions: WorkspacePdfInteractions;
	isCaptureActive: boolean;
	itemId: string;
	onCapture: (capture: WorkspacePdfCaptureResult) => void;
	pageLayout: PageLayout;
	renderCapability: Readonly<RenderCapability> | null;
	selectionPoint: ClientPoint | null;
	workspaceId: string;
}) {
	const page = documentState.document?.pages[pageLayout.pageIndex];
	const pageLayers = (
		<>
			<RenderLayer
				className="block select-none"
				documentId={documentId}
				pageIndex={pageLayout.pageIndex}
				style={{ pointerEvents: "none" }}
			/>
			<TilingLayer
				className="absolute inset-0"
				documentId={documentId}
				pageIndex={pageLayout.pageIndex}
				style={{ pointerEvents: "none" }}
			/>
			{interactions.textSelection ? (
				<TextSelection
					documentId={documentId}
					pageIndex={pageLayout.pageIndex}
					selectionMenu={
						interactions.selectionMenu
							? (props) => (
									<WorkspacePdfAskSelectionMenu
										{...props}
										documentId={documentId}
										itemId={itemId}
										selectionPoint={selectionPoint}
										workspaceId={workspaceId}
									/>
								)
							: undefined
					}
					background="var(--selection)"
				/>
			) : null}
			<AnnotationLayer
				className="absolute inset-0"
				documentId={documentId}
				pageIndex={pageLayout.pageIndex}
			/>
			{interactions.fileCapture && page ? (
				<WorkspacePdfCapturePageOverlay
					active={isCaptureActive}
					documentState={documentState}
					onCapture={onCapture}
					page={page}
					pageLayout={pageLayout}
					renderCapability={renderCapability}
				/>
			) : null}
		</>
	);

	return (
		<div className="absolute inset-0 overflow-hidden bg-background">
			<Rotate documentId={documentId} pageIndex={pageLayout.pageIndex}>
				<div className="absolute inset-0">
					<PagePointerProvider documentId={documentId} pageIndex={pageLayout.pageIndex}>
						{pageLayers}
					</PagePointerProvider>
				</div>
			</Rotate>
		</div>
	);
}

function WorkspacePdfItemViewStateReporter({
	documentId,
	itemId,
	workspaceId,
}: {
	documentId: string;
	itemId: string;
	workspaceId: string;
}) {
	const {
		state: { currentPage },
	} = useScroll(documentId);
	const clearItemViewState = useWorkspaceUiStore((state) => state.clearItemViewState);
	const setItemViewState = useWorkspaceUiStore((state) => state.setItemViewState);

	useEffect(() => {
		setItemViewState(workspaceId, {
			kind: "pdf-page",
			itemId,
			pageNumber: currentPage,
		});
	}, [currentPage, itemId, setItemViewState, workspaceId]);

	useEffect(() => {
		return () => {
			clearItemViewState(workspaceId, itemId);
		};
	}, [clearItemViewState, itemId, workspaceId]);

	return null;
}

function WorkspacePdfSelectionShortcuts({ documentId }: { documentId: string }) {
	const { provides: selection } = useSelectionCapability();

	useWorkspacePaneHotkey(
		"Mod+C",
		(event) => {
			if (!selection?.getState(documentId).selection) {
				return;
			}

			event.preventDefault();
			selection.copyToClipboard(documentId);
		},
		{
			enabled: Boolean(selection),
			ignoreInputs: true,
			preventDefault: false,
			stopPropagation: false,
		},
	);

	return null;
}

function WorkspacePdfViewerStatus({
	action,
	children,
	loading = true,
}: {
	action?: ReactNode;
	children: string;
	loading?: boolean;
}) {
	return (
		<div
			className="flex h-full flex-col items-center justify-center gap-3 bg-background px-4 text-center text-muted-foreground text-sm"
			aria-live="polite"
		>
			{loading ? <Spinner className="size-4" /> : null}
			<p>{children}</p>
			{action}
		</div>
	);
}

function WorkspacePdfLoadFailure({
	children,
	fileName,
	fileUrl,
}: {
	children: string;
	fileName: string;
	fileUrl: string;
}) {
	return (
		<WorkspacePdfViewerStatus
			loading={false}
			action={
				<a
					className="inline-flex h-8 items-center justify-center rounded-md border border-border bg-background px-3 font-medium text-foreground text-sm shadow-xs transition-colors hover:bg-muted"
					download={fileName}
					href={fileUrl}
				>
					Download original file
				</a>
			}
		>
			{children}
		</WorkspacePdfViewerStatus>
	);
}
