import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper } from "@tiptap/react";
import { ImageOff, Maximize2 } from "lucide-react";
import { createContext, type ReactNode, use, useState } from "react";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "#/components/ui/dialog";
import {
	getWorkspaceFileContentUrl,
	getWorkspaceFilePreviewUrl,
} from "#/features/workspaces/model/workspace-file";
import { cn } from "#/lib/utils";

const WorkspaceImageWorkspaceContext = createContext<string | null>(null);

/** Gives every embedded workspace image below it the workspace to load from. */
export function WorkspaceImageProvider({
	children,
	workspaceId,
}: {
	children: ReactNode;
	workspaceId: string;
}) {
	return (
		<WorkspaceImageWorkspaceContext value={workspaceId}>{children}</WorkspaceImageWorkspaceContext>
	);
}

/**
 * One embedded workspace image: bounded preview plus a click-to-expand dialog
 * showing the full-quality original. Shared by the document editor's node view
 * and the read-only study surfaces, so a card face and a document page behave
 * identically. `expandOnClick` is for read-only surfaces; editable surfaces
 * keep click for node selection and get a hover expand button instead.
 */
export function WorkspaceImageContent({
	alt,
	expandOnClick,
	itemId,
}: {
	alt: string | null;
	expandOnClick: boolean;
	itemId: string;
}) {
	const workspaceId = use(WorkspaceImageWorkspaceContext);
	const [isOpen, setIsOpen] = useState(false);
	const [failed, setFailed] = useState(false);

	if (!workspaceId || failed) {
		return <WorkspaceImageUnavailable />;
	}

	const preview = (
		<img
			src={getWorkspaceFilePreviewUrl(workspaceId, itemId)}
			alt={alt ?? ""}
			loading="lazy"
			draggable={false}
			onError={() => setFailed(true)}
			className="max-h-96 max-w-full rounded-lg"
		/>
	);

	return (
		<span className="group/workspace-image relative inline-block max-w-full">
			{expandOnClick ? (
				<button
					type="button"
					aria-label="Expand image"
					className="block cursor-zoom-in focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
					onClick={() => setIsOpen(true)}
				>
					{preview}
				</button>
			) : (
				<>
					{preview}
					<button
						type="button"
						aria-label="Expand image"
						className={cn(
							"absolute top-2 right-2 flex size-7 items-center justify-center rounded-md bg-background/80 text-muted-foreground opacity-0 shadow-sm transition-opacity",
							"hover:text-foreground focus-visible:opacity-100 group-hover/workspace-image:opacity-100",
						)}
						onClick={(event) => {
							event.stopPropagation();
							setIsOpen(true);
						}}
					>
						<Maximize2 className="size-4" aria-hidden="true" />
					</button>
				</>
			)}
			<Dialog open={isOpen} onOpenChange={setIsOpen}>
				<DialogContent className="max-w-[min(96vw,900px)] gap-4 p-4 sm:max-w-4xl">
					<DialogHeader className="pr-8">
						<DialogTitle className="truncate text-base">{alt?.trim() || "Image"}</DialogTitle>
					</DialogHeader>
					<div className="flex max-h-[80vh] items-center justify-center overflow-hidden">
						<img
							src={getWorkspaceFileContentUrl(workspaceId, itemId)}
							alt={alt ?? ""}
							className="max-h-[76vh] max-w-full rounded-lg object-contain"
						/>
					</div>
				</DialogContent>
			</Dialog>
		</span>
	);
}

function WorkspaceImageUnavailable() {
	return (
		<span className="inline-flex items-center gap-2 rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
			<ImageOff className="size-4 shrink-0" aria-hidden="true" />
			Image unavailable
		</span>
	);
}

/** The editor (and read-only study) view for an embedded workspace image. */
export function DocumentImageView({ editor, node, selected }: NodeViewProps) {
	const itemId = typeof node.attrs.itemId === "string" ? node.attrs.itemId : null;
	const alt = typeof node.attrs.alt === "string" ? node.attrs.alt : null;

	return (
		<NodeViewWrapper
			className={cn(
				"workspace-document-image my-2",
				selected && "rounded-lg ring-2 ring-ring/60 ring-offset-2 ring-offset-background",
			)}
			contentEditable={false}
			data-drag-handle
			data-selected={selected ? "true" : undefined}
		>
			{itemId ? (
				<WorkspaceImageContent alt={alt} expandOnClick={!editor.isEditable} itemId={itemId} />
			) : (
				<WorkspaceImageUnavailable />
			)}
		</NodeViewWrapper>
	);
}
