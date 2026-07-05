import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
	CircleDot,
	FolderInput,
	Loader2,
	Palette,
	PenLine,
	Pencil,
	Plus,
	Trash2,
} from "lucide-react";
import type { ComponentType } from "react";

import { Button } from "#/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "#/components/ui/dialog";
import { getWorkspaceMembersQueryOptions } from "#/features/workspaces/components/workspace-share-queries";
import { formatWorkspaceRecency } from "#/features/workspaces/model/display";
import {
	mapWorkspaceHistoryEvents,
	type WorkspaceHistoryEntry,
	type WorkspaceHistoryEntryKind,
} from "#/features/workspaces/model/workspace-history";
import { getWorkspaceHistoryPageFn } from "#/features/workspaces/server/functions";

const historyKindIcons: Record<WorkspaceHistoryEntryKind, ComponentType<{ className?: string }>> = {
	created: Plus,
	renamed: PenLine,
	moved: FolderInput,
	color: Palette,
	edited: Pencil,
	deleted: Trash2,
	change: CircleDot,
};

interface WorkspaceVersionHistoryDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	workspaceId: string;
}

export function WorkspaceVersionHistoryDialog({
	open,
	onOpenChange,
	workspaceId,
}: WorkspaceVersionHistoryDialogProps) {
	const historyQuery = useWorkspaceHistoryQuery(workspaceId, open);
	const membersQuery = useQuery({
		...getWorkspaceMembersQueryOptions(workspaceId),
		enabled: open,
	});
	const actorNamesById = new Map(
		(membersQuery.data ?? []).map((member) => [member.userId, member.name]),
	);
	const entries = mapWorkspaceHistoryEvents(
		(historyQuery.data?.pages ?? []).flatMap((page) => page.events),
	);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="flex max-h-[min(36rem,85vh)] flex-col gap-4 sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Version history</DialogTitle>
					<DialogDescription>
						Every change in this workspace, newest first. History is inspection-only for now —
						restoring earlier versions isn't supported yet.
					</DialogDescription>
				</DialogHeader>

				<div className="min-h-0 flex-1 overflow-y-auto rounded-md border">
					<WorkspaceVersionHistoryList
						entries={entries}
						getActorName={(actorUserId) => resolveActorName(actorUserId, actorNamesById)}
						historyQuery={historyQuery}
					/>
				</div>
			</DialogContent>
		</Dialog>
	);
}

function useWorkspaceHistoryQuery(workspaceId: string, open: boolean) {
	return useInfiniteQuery({
		queryKey: ["workspace-history", workspaceId],
		queryFn: ({ pageParam }) =>
			getWorkspaceHistoryPageFn({
				data: {
					workspaceId,
					beforeRevision: pageParam,
				},
			}),
		initialPageParam: undefined as number | undefined,
		getNextPageParam: (lastPage) => lastPage.nextBeforeRevision ?? undefined,
		enabled: open,
	});
}

function resolveActorName(actorUserId: string | null, actorNamesById: Map<string, string>) {
	if (actorUserId === null) {
		return "Someone";
	}

	return actorNamesById.get(actorUserId) ?? "Former member";
}

function WorkspaceVersionHistoryList({
	entries,
	getActorName,
	historyQuery,
}: {
	entries: WorkspaceHistoryEntry[];
	getActorName: (actorUserId: string | null) => string;
	historyQuery: ReturnType<typeof useWorkspaceHistoryQuery>;
}) {
	if (historyQuery.isPending) {
		return (
			<div className="flex items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
				<Loader2 className="size-4 animate-spin" aria-hidden={true} />
				Loading history…
			</div>
		);
	}

	if (historyQuery.isError) {
		return (
			<div className="flex flex-col items-center gap-3 p-6 text-center text-sm text-muted-foreground">
				Could not load version history.
				<Button
					type="button"
					variant="outline"
					size="sm"
					onClick={() => void historyQuery.refetch()}
				>
					Try again
				</Button>
			</div>
		);
	}

	if (entries.length === 0) {
		return (
			<div className="p-6 text-center text-sm text-muted-foreground">
				No changes yet. Edits to this workspace will show up here.
			</div>
		);
	}

	return (
		<ul className="divide-y">
			{entries.map((entry) => (
				<WorkspaceVersionHistoryRow
					key={entry.id}
					actorName={getActorName(entry.actorUserId)}
					entry={entry}
				/>
			))}
			{historyQuery.hasNextPage ? (
				<li className="flex justify-center p-2">
					<Button
						type="button"
						variant="ghost"
						size="sm"
						disabled={historyQuery.isFetchingNextPage}
						onClick={() => void historyQuery.fetchNextPage()}
					>
						{historyQuery.isFetchingNextPage ? (
							<Loader2 className="size-4 animate-spin" aria-hidden={true} />
						) : null}
						{historyQuery.isFetchingNextPage ? "Loading…" : "Load more"}
					</Button>
				</li>
			) : null}
		</ul>
	);
}

function WorkspaceVersionHistoryRow({
	actorName,
	entry,
}: {
	actorName: string;
	entry: WorkspaceHistoryEntry;
}) {
	const KindIcon = historyKindIcons[entry.kind];

	return (
		<li className="flex items-start gap-3 px-4 py-3 text-sm">
			<KindIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden={true} />
			<div className="min-w-0 flex-1">
				<p className="break-words">
					<span className="font-medium">{actorName}</span> {entry.summary}
				</p>
			</div>
			<time
				dateTime={entry.createdAt}
				className="shrink-0 whitespace-nowrap text-xs text-muted-foreground"
			>
				{formatWorkspaceRecency(entry.createdAt)}
			</time>
		</li>
	);
}
