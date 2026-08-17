import { ChevronDown, FilePen } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "#/components/ui/popover";
import type { AiChatDocumentEditGroup } from "#/features/workspaces/components/ai-chat/ai-chat-document-edit-actions";
import { useDocumentEditReview } from "#/features/workspaces/documents/document-edit-review-context";
import { useWorkspaceLocationActions } from "#/features/workspaces/locations/workspace-location-context";
import { getWorkspacePathName } from "#/features/workspaces/model/workspace-paths";

/**
 * Receipt for the documents the assistant changed in one turn: what it touched
 * and how much it changed, read straight from the turn itself.
 *
 * Deliberately asks the server nothing. Whether those changes can still be
 * reviewed or undone is a live question, and answering it up front would cost a
 * request per row on every chat load just to render a label. Clicking finds out.
 *
 * Older responses pass `collapsed`: their receipts are mostly no longer
 * reviewable (only the latest unchanged edit is), so they shrink to one line
 * with the rows in a popover — no layout shift, no wall of dead buttons.
 */
export function AiChatDocumentEditActions({
	collapsed = false,
	groups,
}: {
	collapsed?: boolean;
	groups: readonly AiChatDocumentEditGroup[];
}) {
	// A deleted document has nothing left to open.
	const { getItem } = useWorkspaceLocationActions();
	const knownGroups = groups.filter((group) => getItem(group.itemId));

	if (knownGroups.length === 0) {
		return null;
	}

	const headerLabel = `Edited ${knownGroups.length} ${knownGroups.length === 1 ? "document" : "documents"}`;

	if (collapsed) {
		return (
			<Popover>
				<PopoverTrigger className="block w-fit max-w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
					<div className="inline-flex items-center gap-1.5 rounded-lg bg-muted/40 px-2.5 py-1.5 text-muted-foreground text-xs">
						<FilePen className="size-3 shrink-0" aria-hidden="true" />
						<span className="font-medium">{headerLabel}</span>
						<ChevronDown className="size-3 shrink-0" aria-hidden="true" />
					</div>
				</PopoverTrigger>
				<PopoverContent align="start" className="w-72 p-0">
					<div className="divide-y divide-foreground/5">
						{knownGroups.map((group) => (
							<DocumentEditRow key={group.itemId} group={group} />
						))}
					</div>
				</PopoverContent>
			</Popover>
		);
	}

	return (
		<div
			aria-label="Document changes from this response"
			className="overflow-hidden rounded-lg bg-muted/40"
		>
			<div className="flex items-center gap-1.5 px-2.5 py-1.5 text-muted-foreground text-xs">
				<FilePen className="size-3 shrink-0" aria-hidden="true" />
				<span className="font-medium">{headerLabel}</span>
			</div>
			<div className="divide-y divide-foreground/5 border-foreground/5 border-t">
				{knownGroups.map((group) => (
					<DocumentEditRow key={group.itemId} group={group} />
				))}
			</div>
		</div>
	);
}

function DocumentEditRow({ group }: { group: AiChatDocumentEditGroup }) {
	const { showReview } = useDocumentEditReview();

	// The row is a destination: clicking takes you to the changes, opening the
	// document or switching tabs as needed. If they are no longer reviewable the
	// document still opens and the overlay says why.
	return (
		<button
			type="button"
			className="flex w-full min-w-0 items-center gap-2 px-2.5 py-2 text-left transition-colors hover:bg-foreground/5"
			onClick={() => {
				void showReview({ itemId: group.itemId, receiptIds: group.receiptIds });
			}}
		>
			<div className="min-w-0 flex-1">
				<div className="truncate text-sm" title={group.path}>
					<DocumentPathLabel path={group.path} />
				</div>
				<ChangeSummary lineChanges={group.lineChanges} />
			</div>
		</button>
	);
}

function DocumentPathLabel({ path }: { path: string }) {
	const separatorIndex = path.lastIndexOf("/");
	const folder = separatorIndex > 0 ? path.slice(0, separatorIndex + 1) : "";

	return (
		<>
			{folder ? <span className="text-muted-foreground">{folder}</span> : null}
			<span className="font-medium">{getWorkspacePathName(path)}</span>
		</>
	);
}

function ChangeSummary({ lineChanges }: { lineChanges: { added: number; removed: number } }) {
	if (!lineChanges.added && !lineChanges.removed) {
		return null;
	}

	// Colour carries the meaning at a glance, muted so a removal reads as a fact
	// rather than an alarm.
	return (
		<div className="mt-0.5 flex items-center gap-1.5 text-muted-foreground text-xs">
			<span>Lines:</span>
			{lineChanges.added > 0 ? <span className="text-success/90">+{lineChanges.added}</span> : null}
			{lineChanges.added > 0 && lineChanges.removed > 0 ? (
				<span className="text-muted-foreground/50">·</span>
			) : null}
			{lineChanges.removed > 0 ? (
				<span className="text-destructive/80">−{lineChanges.removed}</span>
			) : null}
		</div>
	);
}
