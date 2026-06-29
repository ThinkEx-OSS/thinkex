import { useEffect, useState } from "react";

import { Button } from "#/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "#/components/ui/dialog";
import type { WorkspaceClipboardIntake } from "#/features/workspaces/clipboard/workspace-clipboard-intake";
import { getWorkspaceObjectRegistryEntry } from "#/features/workspaces/model/object-registry";
import { workspaceColors } from "#/features/workspaces/model/workspace-colors";
import { resolveWorkspaceFileTypeFromHint } from "#/features/workspaces/model/workspace-file";
import { workspaceItemTypeColors } from "#/features/workspaces/model/workspace-item-colors";
import { cn } from "#/lib/utils";

const documentDisplay = getWorkspaceObjectRegistryEntry("document");
const documentIconClassName = workspaceColors[workspaceItemTypeColors.document].iconClassName;
const fileIconClassName = workspaceColors[workspaceItemTypeColors.file].iconClassName;

export function WorkspaceClipboardIntakeDialog({
	intake,
	open,
	onConfirm,
	onOpenChange,
}: {
	intake: WorkspaceClipboardIntake | null;
	open: boolean;
	onConfirm: () => void;
	onOpenChange: (open: boolean) => void;
}) {
	if (!intake) {
		return null;
	}

	const documentCount = intake.document ? 1 : 0;
	const fileCount = intake.files.length;
	const mediaSkipped = intake.document?.removedMediaCount ?? 0;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="min-w-0 sm:max-w-lg">
				<DialogHeader className="min-w-0 pr-8">
					<DialogTitle>Create from pasted content?</DialogTitle>
				</DialogHeader>

				<div className="grid min-w-0 gap-4">
					<section className="grid min-w-0 gap-2">
						<ul className="grid min-w-0 gap-2">
							{intake.document ? (
								<WorkspaceClipboardDocumentRow
									name={intake.document.name}
									source={intake.document.source}
								/>
							) : null}
							{intake.files.map((file) => (
								<WorkspaceClipboardFileRow file={file} key={getFileKey(file)} />
							))}
						</ul>
					</section>

					{mediaSkipped > 0 ? (
						<p className="text-muted-foreground text-sm">
							Embedded images or media in the copied content will be skipped.
						</p>
					) : null}
				</div>

				<DialogFooter className="flex-row justify-end">
					<Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button type="button" onClick={onConfirm}>
						{getConfirmLabel({ documentCount, fileCount })}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function WorkspaceClipboardDocumentRow({
	name,
	source,
}: {
	name: string;
	source: "formatted" | "plain";
}) {
	const Icon = documentDisplay.icon;

	return (
		<li className="grid min-w-0 grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-3 rounded-lg border border-border/70 px-3 py-2.5">
			<div className="flex size-10 items-center justify-center rounded-md bg-muted/70">
				<Icon className={cn("size-5", documentIconClassName)} />
			</div>
			<div className="min-w-0">
				<p className="font-medium text-sm">{documentDisplay.label}</p>
				<p className="min-w-0 truncate text-muted-foreground text-xs">
					{name} - {source === "formatted" ? "keeps formatting" : "plain text"}
				</p>
			</div>
		</li>
	);
}

function WorkspaceClipboardFileRow({ file }: { file: File }) {
	const previewableImage = isBrowserPreviewableImage(file);
	const descriptor = resolveWorkspaceFileTypeFromHint({
		contentType: file.type,
		fileName: file.name,
	});
	const label = descriptor?.label ?? "File";
	const Icon = descriptor?.icon ?? getWorkspaceObjectRegistryEntry("file").icon;

	return (
		<li className="grid min-w-0 grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-3 rounded-lg border border-border/70 px-3 py-2.5">
			{previewableImage ? (
				<WorkspaceClipboardImagePreview file={file} />
			) : (
				<div className="flex size-14 items-center justify-center rounded-md bg-muted/70">
					<Icon className={cn("size-6", fileIconClassName)} />
				</div>
			)}
			<div className="min-w-0">
				<p className="font-medium text-sm">{label}</p>
				<p className="min-w-0 truncate text-muted-foreground text-xs">
					{file.name || "Pasted file"} - {formatFileSize(file.size)}
				</p>
			</div>
		</li>
	);
}

function WorkspaceClipboardImagePreview({ file }: { file: File }) {
	const [url] = useState(() => URL.createObjectURL(file));

	useEffect(() => {
		return () => {
			URL.revokeObjectURL(url);
		};
	}, [url]);

	return (
		<img alt="" className="size-14 rounded-md border border-border/70 object-cover" src={url} />
	);
}

function getConfirmLabel(input: { documentCount: number; fileCount: number }) {
	const total = input.documentCount + input.fileCount;

	return total > 1 ? `Create ${total} items` : "Create item";
}

function getFileKey(file: File) {
	return `${file.name}-${file.type}-${file.size}-${file.lastModified}`;
}

function isBrowserPreviewableImage(file: File) {
	return ["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type);
}

function formatFileSize(bytes: number) {
	if (bytes < 1024) {
		return `${bytes} B`;
	}

	if (bytes < 1024 * 1024) {
		return `${Math.ceil(bytes / 1024)} KB`;
	}

	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
