import { LoaderCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
	AlertDialog,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "#/components/ui/alert-dialog";
import { Button } from "#/components/ui/button";
import { CONTACT_EMAIL } from "#/components/community-links";
import type { WorkspaceSummary } from "#/features/workspaces/contracts";
import { capturePostHogClientEvent } from "#/integrations/posthog/provider";

type ExportDialogPhase = "confirm" | "checking" | "too_large";

export function WorkspaceExportDialog({
	onOpenChange,
	open,
	workspace,
}: {
	onOpenChange: (open: boolean) => void;
	open: boolean;
	workspace: WorkspaceSummary;
}) {
	const [phase, setPhase] = useState<ExportDialogPhase>("confirm");
	const checking = phase === "checking";

	const closeDialog = () => {
		onOpenChange(false);
		setPhase("confirm");
	};

	const updateOpen = (nextOpen: boolean) => {
		if (!nextOpen && checking) {
			return;
		}

		onOpenChange(nextOpen);
		if (!nextOpen) {
			setPhase("confirm");
		}
	};

	const confirmExport = async () => {
		setPhase("checking");
		try {
			const preflight = await fetch(
				`/api/v1/workspaces/${encodeURIComponent(workspace.id)}/export?preflight=1`,
			);
			if (preflight.status === 413) {
				capturePostHogClientEvent("workspace_export_too_large", {
					workspace_id: workspace.id,
				});
				setPhase("too_large");
				return;
			}
			if (!preflight.ok) {
				throw new Error("Unable to check this workspace export.");
			}

			closeDialog();
			startWorkspaceExport(workspace.id);
		} catch {
			setPhase("confirm");
			toast.error("Unable to prepare this workspace export.");
		}
	};

	return (
		<AlertDialog open={open} onOpenChange={updateOpen}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>
						{phase === "too_large" ? "Workspace too large to export" : "Export this workspace?"}
					</AlertDialogTitle>
					<AlertDialogDescription>
						{phase === "too_large" ? (
							<>
								This workspace is too large to export right now. If you need a copy, email{" "}
								<a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> and we can help.
							</>
						) : (
							"This downloads a copy of the documents and files in this workspace. It may take a moment to prepare."
						)}
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel disabled={checking}>
						{phase === "too_large" ? "Close" : "Cancel"}
					</AlertDialogCancel>
					{phase !== "too_large" ? (
						<Button disabled={checking} onClick={() => void confirmExport()}>
							{checking ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
							{checking ? "Preparing" : "Export workspace"}
						</Button>
					) : (
						<Button render={<a href={getLargeExportEmailHref(workspace)} />}>Email us</Button>
					)}
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

function getLargeExportEmailHref(workspace: WorkspaceSummary) {
	const subject = encodeURIComponent("Large workspace export");
	const body = encodeURIComponent(`Workspace: ${workspace.name}\nWorkspace ID: ${workspace.id}`);
	return `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`;
}

function startWorkspaceExport(workspaceId: string) {
	toast.message("Preparing workspace export...");
	const link = document.createElement("a");
	link.href = `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/export`;
	link.target = "_blank";
	link.rel = "noopener";
	link.click();
}
