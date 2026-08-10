import { useInfiniteQuery } from "@tanstack/react-query";
import {
	Activity,
	ChevronRight,
	Clock3,
	FilePenLine,
	FolderInput,
	History,
	Link2,
	LoaderCircle,
	Palette,
	Plus,
	RotateCcw,
	Trash2,
} from "lucide-react";
import { useState } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "#/components/ui/avatar";
import { Button } from "#/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "#/components/ui/dialog";
import type { WorkspaceHistoryEntry } from "#/features/workspaces/history/workspace-history-contract";
import { listWorkspaceHistoryFn } from "#/features/workspaces/history/workspace-history-functions";
import { WorkspaceHistoryVersionPreview } from "#/features/workspaces/components/WorkspaceHistoryVersionPreview";
import { cn } from "#/lib/utils";

const historyPageSize = 50;

export function WorkspaceHistoryDialog({
	open,
	onOpenChange,
	workspaceId,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	workspaceId: string;
}) {
	const [selectedVersion, setSelectedVersion] = useState<{
		actorName: string;
		createdAt: string;
		entryId: string;
		itemId: string;
		itemName: string;
		versionId: string;
	} | null>(null);
	const historyQuery = useInfiniteQuery({
		enabled: open,
		getNextPageParam: (lastPage: WorkspaceHistoryEntry[]) =>
			lastPage.length === historyPageSize ? lastPage.at(-1)?.revision : undefined,
		initialPageParam: undefined as number | undefined,
		queryFn: ({ pageParam }: { pageParam: number | undefined }) =>
			listWorkspaceHistoryFn({
				data: {
					...(pageParam ? { beforeRevision: pageParam } : {}),
					limit: historyPageSize,
					workspaceId,
				},
			}),
		queryKey: ["workspace-history", workspaceId],
	});
	const entries = historyQuery.data?.pages.flat() ?? [];
	const handleOpenChange = (nextOpen: boolean) => {
		if (!nextOpen) setSelectedVersion(null);
		onOpenChange(nextOpen);
	};

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="flex h-[min(48rem,88vh)] flex-col gap-0 p-0 sm:max-w-6xl">
				<DialogHeader className="shrink-0 border-b px-6 py-5">
					<DialogTitle>Workspace history</DialogTitle>
					<DialogDescription>
						Recent changes across this workspace. Select a document version to compare or restore
						it.
					</DialogDescription>
				</DialogHeader>
				<div className="grid min-h-0 flex-1 grid-rows-[minmax(12rem,2fr)_3fr] sm:grid-cols-[20rem_minmax(0,1fr)] sm:grid-rows-1">
					<aside className="flex min-h-0 flex-col border-b sm:border-r sm:border-b-0">
						<div className="shrink-0 border-b px-4 py-3">
							<p className="font-medium text-sm">Recent activity</p>
						</div>
						<div className="min-h-0 flex-1 overflow-y-auto p-2">
							{historyQuery.isPending ? (
								<div className="flex items-center justify-center gap-2 py-12 text-muted-foreground text-sm">
									<LoaderCircle className="size-4 animate-spin" /> Loading history…
								</div>
							) : historyQuery.isError ? (
								<div className="py-12 text-center text-destructive text-sm">
									Could not load workspace history.
								</div>
							) : entries.length === 0 ? (
								<div className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground text-sm">
									<Clock3 className="size-5" />
									Changes will appear here as you work.
								</div>
							) : (
								<ul className="space-y-1">
									{entries.map((entry) => {
										const document = entry.items.find((item) => item.type === "document");
										const versionId = entry.versionId;
										const isSelectable = Boolean(
											versionId && document && entry.type === "workspace.item.content.updated",
										);
										const isSelected = entry.id === selectedVersion?.entryId;
										const content = (
											<>
												<div className="min-w-0 flex-1 text-left">
													<div className="flex items-center gap-2">
														<div className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
															<HistoryActionIcon entry={entry} />
														</div>
														<p className="truncate text-sm">{describeHistoryEntry(entry)}</p>
													</div>
													<div className="mt-1 flex items-center gap-2 text-muted-foreground text-xs">
														<Avatar size="sm" className="size-5 shadow-none">
															<AvatarImage src={entry.actor.image ?? undefined} alt="" />
															<AvatarFallback className="text-[9px]">
																{getInitials(entry.actor.name)}
															</AvatarFallback>
														</Avatar>
														<span className="truncate">{entry.actor.name}</span>
														<span aria-hidden="true">·</span>
														<span className="shrink-0">{formatHistoryDate(entry.createdAt)}</span>
													</div>
												</div>
												{isSelectable ? (
													<ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
												) : null}
											</>
										);
										return (
											<li key={`${entry.id}:${entry.versionId ?? "event"}`}>
												{isSelectable && document && versionId ? (
													<button
														type="button"
														className={cn(
															"flex w-full items-start gap-2 rounded-lg px-3 py-3 transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
															isSelected && "bg-accent text-accent-foreground",
														)}
														onClick={() => {
															setSelectedVersion({
																actorName: entry.actor.name,
																createdAt: entry.createdAt,
																entryId: entry.id,
																itemId: document.id,
																itemName: document.name,
																versionId,
															});
														}}
													>
														{content}
													</button>
												) : (
													<div className="flex items-start gap-2 px-3 py-3">{content}</div>
												)}
											</li>
										);
									})}
									{historyQuery.hasNextPage ? (
										<li className="flex justify-center p-3">
											<Button
												type="button"
												variant="outline"
												size="sm"
												disabled={historyQuery.isFetchingNextPage}
												onClick={() => void historyQuery.fetchNextPage()}
											>
												{historyQuery.isFetchingNextPage ? (
													<LoaderCircle className="size-4 animate-spin" />
												) : null}
												Load older
											</Button>
										</li>
									) : null}
								</ul>
							)}
						</div>
					</aside>
					<section className="flex min-h-0 min-w-0 flex-col bg-background/40">
						{selectedVersion ? (
							<WorkspaceHistoryVersionPreview
								actorName={selectedVersion.actorName}
								createdAt={selectedVersion.createdAt}
								itemId={selectedVersion.itemId}
								itemName={selectedVersion.itemName}
								onRestored={() => setSelectedVersion(null)}
								versionId={selectedVersion.versionId}
								workspaceId={workspaceId}
							/>
						) : (
							<div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center">
								<div className="mb-4 flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
									<History className="size-5" aria-hidden="true" />
								</div>
								<p className="font-medium">Select a document version</p>
								<p className="mt-1 max-w-sm text-muted-foreground text-sm">
									Choose an editable change from the timeline to see exactly what was added or
									removed.
								</p>
							</div>
						)}
					</section>
				</div>
			</DialogContent>
		</Dialog>
	);
}

function formatHistoryDate(createdAt: string) {
	return new Date(createdAt).toLocaleString(undefined, {
		dateStyle: "short",
		timeStyle: "short",
	});
}

function HistoryActionIcon({ entry }: { entry: WorkspaceHistoryEntry }) {
	const className = "size-3";
	if (entry.type === "workspace.item.content.updated") {
		return entry.origin === "restore" ? (
			<RotateCcw className={className} aria-hidden="true" />
		) : (
			<FilePenLine className={className} aria-hidden="true" />
		);
	}
	const Icon =
		{
			"workspace.item.color.updated": Palette,
			"workspace.item.created": Plus,
			"workspace.item.deleted": Trash2,
			"workspace.item.renamed": FilePenLine,
			"workspace.items.moved": FolderInput,
			"workspace.relations.updated": Link2,
		}[entry.type] ?? Activity;
	return <Icon className={className} aria-hidden="true" />;
}

function getInitials(name: string) {
	return name
		.split(/\s+/)
		.map((part) => part[0])
		.join("")
		.slice(0, 2)
		.toUpperCase();
}

function describeHistoryEntry(entry: WorkspaceHistoryEntry) {
	const names = entry.items.map((item) => item.name);
	const itemLabel = names.length > 0 ? names.join(", ") : "workspace";
	const actions: Record<string, string> = {
		"workspace.item.color.updated": "Changed the color of",
		"workspace.item.content.updated": entry.origin === "restore" ? "Restored" : "Edited",
		"workspace.item.created": "Created",
		"workspace.item.deleted": "Deleted",
		"workspace.item.renamed": "Renamed",
		"workspace.items.moved": "Moved",
		"workspace.relations.updated": "Updated links in",
	};
	return `${actions[entry.type] ?? "Updated"} ${itemLabel}`;
}
