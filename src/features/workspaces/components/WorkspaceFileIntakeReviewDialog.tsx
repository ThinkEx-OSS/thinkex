import { Button } from "#/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "#/components/ui/dialog";
import type { ReviewedIncomingFile } from "#/features/workspaces/files/file-intake-review";

interface WorkspaceFileIntakeReviewDialogBaseProps {
	open: boolean;
	workspaceFallbackFiles: ReviewedIncomingFile[];
	rejectedFiles: ReviewedIncomingFile[];
	onOpenChange: (open: boolean) => void;
}

type WorkspaceFileIntakeReviewDialogProps =
	| (WorkspaceFileIntakeReviewDialogBaseProps & {
			mode: "chat_fallback";
			onConfirmWorkspaceFallback: () => void;
	  })
	| (WorkspaceFileIntakeReviewDialogBaseProps & {
			mode: "workspace_rejection";
			onConfirmWorkspaceFallback?: never;
	  });

export function WorkspaceFileIntakeReviewDialog({
	open,
	mode,
	workspaceFallbackFiles,
	rejectedFiles,
	onConfirmWorkspaceFallback,
	onOpenChange,
}: WorkspaceFileIntakeReviewDialogProps) {
	const hasWorkspaceFallback = workspaceFallbackFiles.length > 0;

	const title =
		mode === "chat_fallback" && hasWorkspaceFallback
			? "Add these files to the workspace?"
			: "Couldn't add files";

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
				</DialogHeader>

				<div className="grid gap-4">
					{workspaceFallbackFiles.length > 0 ? (
						<WorkspaceFileReviewSection
							description="They can go in the workspace instead."
							files={workspaceFallbackFiles}
							title="Not added to chat"
						/>
					) : null}

					{rejectedFiles.length > 0 ? (
						<WorkspaceFileReviewSection files={rejectedFiles} title="Can't be added" />
					) : null}
				</div>

				<DialogFooter>
					{mode === "chat_fallback" && hasWorkspaceFallback ? (
						<>
							<Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
								Cancel
							</Button>
							<Button type="button" onClick={onConfirmWorkspaceFallback}>
								Add to workspace
							</Button>
						</>
					) : (
						<Button type="button" onClick={() => onOpenChange(false)}>
							OK
						</Button>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function WorkspaceFileReviewSection({
	title,
	description,
	files,
}: {
	title: string;
	description?: string;
	files: ReviewedIncomingFile[];
}) {
	return (
		<section className="grid gap-2">
			<div className="grid gap-1">
				<h3 className="font-medium text-sm">{title}</h3>
				{description ? <p className="text-muted-foreground text-xs">{description}</p> : null}
			</div>

			<ul className="grid max-h-56 gap-2 overflow-y-auto pr-1">
				{files.map((item) => (
					<li
						key={`${item.filename}-${item.reasonCode}-${item.file.size}-${item.file.lastModified}`}
						className="rounded-lg border border-border/70 px-3 py-2"
					>
						<p className="truncate font-medium text-sm">{item.filename}</p>
						<p className="text-muted-foreground text-xs leading-relaxed">{item.message}</p>
					</li>
				))}
			</ul>
		</section>
	);
}
