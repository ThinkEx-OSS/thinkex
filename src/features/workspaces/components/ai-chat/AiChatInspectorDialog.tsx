import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { useState } from "react";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "#/components/ui/dialog";
import { ScrollArea } from "#/components/ui/scroll-area";
import type { AIInspectorSnapshot } from "#/features/workspaces/ai/ai-inspector";
import { getAIInspectorRunViews } from "#/features/workspaces/ai/ai-inspector-view-model";
import { AIInspectorRunPanel } from "#/features/workspaces/components/ai-chat/AiChatInspectorViews";
import { cn } from "#/lib/utils";

interface AiChatInspectorDialogProps {
	getSnapshot: (threadId: string) => Promise<AIInspectorSnapshot>;
	onOpenChange: (open: boolean) => void;
	open: boolean;
	threadId?: string;
}

export function AiChatInspectorDialog({
	getSnapshot,
	onOpenChange,
	open,
	threadId,
}: AiChatInspectorDialogProps) {
	const [selectedRunIdDraft, setSelectedRunIdDraft] = useState<string>();
	const {
		data: snapshot,
		error: snapshotError,
		isFetching: isSnapshotFetching,
		refetch: refetchSnapshot,
	} = useQuery({
		enabled: open && Boolean(threadId),
		queryFn: () => getSnapshot(threadId as string),
		queryKey: ["ai-inspector-snapshot", threadId, getSnapshot],
	});
	const error =
		snapshotError instanceof Error
			? snapshotError.message
			: snapshotError
				? "Failed to load AI inspector events."
				: undefined;

	const runs = getAIInspectorRunViews(snapshot?.events ?? []);
	const selectedRunId =
		selectedRunIdDraft && runs.some((run) => run.runId === selectedRunIdDraft)
			? selectedRunIdDraft
			: runs[0]?.runId;
	const selectedRun = runs.find((run) => run.runId === selectedRunId) ?? runs[0];

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="fixed inset-0 top-0 left-0 flex h-dvh w-dvw max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-0 bg-background p-0 sm:max-w-none">
				<DialogHeader className="border-b px-4 py-3">
					<div className="flex items-start justify-between gap-3 pr-9">
						<div className="min-w-0">
							<DialogTitle>AI Inspector</DialogTitle>
							<DialogDescription className="truncate">
								{threadId ?? "No active thread"}
							</DialogDescription>
						</div>
						<Button
							type="button"
							variant="outline"
							size="sm"
							className="shrink-0 gap-1.5"
							disabled={!threadId || isSnapshotFetching}
							onClick={() => void refetchSnapshot()}
						>
							<RefreshCw
								className={cn("size-3.5", isSnapshotFetching && "animate-spin")}
								aria-hidden="true"
							/>
							Refresh
						</Button>
					</div>
				</DialogHeader>
				<ScrollArea className="min-h-0 flex-1">
					<div className="grid gap-4 p-4 lg:p-6">
						{snapshot && !snapshot.isEnabled ? (
							<p className="text-muted-foreground text-sm">
								The AI inspector is only available in development.
							</p>
						) : null}
						{error ? (
							<p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive text-sm">
								{error}
							</p>
						) : null}
						{snapshot?.isEnabled && runs.length === 0 ? (
							<p className="text-muted-foreground text-sm">
								No inspector events have been captured for this thread yet.
							</p>
						) : null}
						{runs.length > 1 ? (
							<div className="flex flex-wrap gap-2">
								{runs.map((run, index) => (
									<Button
										key={run.runId}
										type="button"
										variant={run.runId === selectedRun?.runId ? "secondary" : "outline"}
										size="sm"
										className="gap-2"
										onClick={() => setSelectedRunIdDraft(run.runId)}
									>
										Run {runs.length - index}
										<Badge variant="outline" className="rounded-full font-normal">
											{run.eventCount}
										</Badge>
									</Button>
								))}
							</div>
						) : null}
						{selectedRun ? <AIInspectorRunPanel run={selectedRun} /> : null}
					</div>
				</ScrollArea>
			</DialogContent>
		</Dialog>
	);
}
