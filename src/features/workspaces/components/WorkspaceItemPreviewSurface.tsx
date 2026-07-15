import { useEffect, useState } from "react";

import {
	workspaceItemDocumentPreviewPanelClass,
	workspaceItemDocumentPreviewTextClass,
	workspaceItemPreviewContentLayerClass,
	workspaceItemPreviewIconClass,
} from "#/features/workspaces/components/workspace-item-card-chrome";
import { getWorkspaceDocumentPreviewText } from "#/features/workspaces/documents/document-preview-text";
import { getWorkspaceItemDisplay } from "#/features/workspaces/model/item-display";
import type { WorkspaceItem } from "#/features/workspaces/model/types";
import {
	getWorkspaceFilePreviewUrl,
	resolveWorkspaceFileTypeFromItem,
} from "#/features/workspaces/model/workspace-file";
import { cn } from "#/lib/utils";

interface WorkspaceItemPreviewSurfaceProps {
	enablePreviews: boolean;
	item: WorkspaceItem;
}

export default function WorkspaceItemPreviewSurface({
	enablePreviews,
	item,
}: WorkspaceItemPreviewSurfaceProps) {
	if (!enablePreviews) {
		return <WorkspaceItemIconPreview item={item} />;
	}

	switch (item.type) {
		case "document":
			return <WorkspaceItemDocumentPreview item={item} />;
		case "file":
			return <WorkspaceItemFilePreview item={item} />;
		default:
			return <WorkspaceItemIconPreview item={item} />;
	}
}

function WorkspaceItemDocumentPreview({ item }: { item: WorkspaceItem }) {
	const previewText = getWorkspaceDocumentPreviewText(item);
	return (
		<div className={workspaceItemPreviewContentLayerClass}>
			{previewText ? (
				<div className={workspaceItemDocumentPreviewPanelClass}>
					<p className={workspaceItemDocumentPreviewTextClass}>{previewText}</p>
				</div>
			) : (
				<WorkspaceItemDocumentPreviewEmpty />
			)}
		</div>
	);
}

function WorkspaceItemDocumentPreviewEmpty() {
	return (
		<div className={workspaceItemDocumentPreviewPanelClass}>
			<p className={workspaceItemDocumentPreviewTextClass}>Empty document</p>
		</div>
	);
}

function WorkspaceItemFilePreview({ item }: { item: WorkspaceItem }) {
	const fileDescriptor = resolveWorkspaceFileTypeFromItem(item);
	const previewUrl =
		fileDescriptor?.previewGenerator != null
			? getWorkspaceFilePreviewUrl(item.workspaceId, item.id)
			: null;

	return previewUrl ? (
		<WorkspaceItemFileThumbnail item={item} previewUrl={previewUrl} />
	) : (
		<WorkspaceItemIconPreview item={item} />
	);
}

const previewRetryDelaysMs = [1_000, 2_000, 4_000, 8_000, 15_000, 15_000, 15_000] as const;

function WorkspaceItemFileThumbnail({
	item,
	previewUrl,
}: {
	item: WorkspaceItem;
	previewUrl: string;
}) {
	const [attempt, setAttempt] = useState(0);
	const [waitingToRetry, setWaitingToRetry] = useState(false);

	useEffect(() => {
		if (!waitingToRetry || attempt >= previewRetryDelaysMs.length) {
			return;
		}

		const retry = window.setTimeout(() => {
			setAttempt((current) => current + 1);
			setWaitingToRetry(false);
		}, previewRetryDelaysMs[attempt]);

		return () => window.clearTimeout(retry);
	}, [attempt, waitingToRetry]);

	const showImage = !waitingToRetry && attempt <= previewRetryDelaysMs.length;

	if (showImage) {
		const requestUrl = attempt === 0 ? previewUrl : `${previewUrl}?attempt=${attempt}`;
		return (
			<div className={workspaceItemPreviewContentLayerClass}>
				<img
					src={requestUrl}
					alt=""
					loading="lazy"
					decoding="async"
					className="size-full object-cover object-top"
					onError={() => setWaitingToRetry(true)}
				/>
			</div>
		);
	}

	return <WorkspaceItemIconPreview item={item} />;
}

/** Icon-only preview for folders and types without a custom thumbnail yet. */
function WorkspaceItemIconPreview({ item }: { item: WorkspaceItem }) {
	const { Icon, iconClassName } = getWorkspaceItemDisplay(item);

	return (
		<div className={workspaceItemPreviewContentLayerClass}>
			<div className="flex size-full items-center justify-center bg-transparent">
				<Icon
					className={cn(workspaceItemPreviewIconClass, iconClassName)}
					strokeWidth={1.75}
					aria-hidden="true"
				/>
			</div>
		</div>
	);
}
