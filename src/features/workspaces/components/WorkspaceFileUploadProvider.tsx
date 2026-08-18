import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type ChangeEvent, createContext, type ReactNode, use, useRef, useState } from "react";

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "#/components/ui/alert-dialog";
import { formatBillingResetDate, useBillingState } from "#/features/account/use-billing-state";
import { showUpgradeDialog } from "#/features/account/upgrade-navigation";
import { applyWorkspacePageDeltaToCache } from "#/features/workspaces/cache-page";
import { useWorkspaceMutationAccess } from "#/features/workspaces/components/workspace-mutation-access";
import { runWorkspaceFileUploadBatch } from "#/features/workspaces/files/workspace-file-upload";
import { workspaceUploadAccept } from "#/features/workspaces/upload/workspace-upload-intake";

interface WorkspaceFileUploadContextValue {
	requestFileSelection: (onSelectFiles: (files: File[]) => void) => void;
	uploadFiles: (files: Iterable<File>, parentId: string | null) => void;
}

const WorkspaceFileUploadContext = createContext<WorkspaceFileUploadContextValue | null>(null);

export function WorkspaceFileUploadProvider({
	children,
	workspaceId,
}: {
	children: ReactNode;
	workspaceId: string;
}) {
	const queryClient = useQueryClient();
	const { capabilities } = useWorkspaceMutationAccess();
	const inputRef = useRef<HTMLInputElement>(null);
	const onSelectFilesRef = useRef<((files: File[]) => void) | null>(null);
	const [limitResult, setLimitResult] = useState<{ successCount: number; total: number } | null>(
		null,
	);

	const uploadFiles = (files: Iterable<File>, parentId: string | null) => {
		if (!capabilities.canMutateContent) {
			return;
		}

		const fileList = Array.from(files);

		if (fileList.length === 0) {
			return;
		}

		void runWorkspaceFileUploadBatch({
			workspaceId,
			parentId,
			files: fileList,
			onLimitReached: setLimitResult,
			onSuccess: (command) => {
				applyWorkspacePageDeltaToCache(queryClient, {
					type: "workspace.items.upserted",
					workspaceId,
					items: [command.result],
					revision: command.revision,
				});
			},
		});
	};

	const requestFileSelection = (onSelectFiles: (files: File[]) => void) => {
		onSelectFilesRef.current = onSelectFiles;
		if (inputRef.current) {
			inputRef.current.value = "";
			inputRef.current.click();
		}
	};

	const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
		const selectedFiles = event.currentTarget.files ? Array.from(event.currentTarget.files) : [];

		event.currentTarget.value = "";

		if (selectedFiles.length === 0) {
			return;
		}

		const onSelectFiles = onSelectFilesRef.current;
		onSelectFilesRef.current = null;
		onSelectFiles?.(selectedFiles);
	};

	return (
		<>
			<WorkspaceFileUploadContext.Provider value={{ requestFileSelection, uploadFiles }}>
				<input
					ref={inputRef}
					type="file"
					multiple
					accept={workspaceUploadAccept}
					aria-label="Upload files"
					className="hidden"
					tabIndex={-1}
					onChange={handleInputChange}
				/>
				{children}
			</WorkspaceFileUploadContext.Provider>
			<WorkspaceFileLimitDialog
				result={limitResult}
				onOpenChange={(open) => !open && setLimitResult(null)}
			/>
		</>
	);
}

function WorkspaceFileLimitDialog({
	onOpenChange,
	result,
}: {
	onOpenChange: (open: boolean) => void;
	result: { successCount: number; total: number } | null;
}) {
	const { balances, isPending, isPro } = useBillingState();
	// Read rather than hard-coded: the allowance lives in autumn.config.ts, and a
	// second copy of the number here would drift the first time it moves.
	const uploads = balances?.file_uploads;
	const resetsOn = formatBillingResetDate(uploads?.next_reset_at);
	const partialUpload = result && result.successCount > 0;

	return (
		<AlertDialog open={Boolean(result)} onOpenChange={onOpenChange}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>You&rsquo;ve reached your file upload limit</AlertDialogTitle>
					<AlertDialogDescription>
						{partialUpload ? `Uploaded ${result.successCount} of ${result.total} files. ` : null}
						{uploads?.granted
							? `${isPro ? "Pro" : "Free"} includes ${uploads.granted.toLocaleString()} file uploads each month.`
							: "Your file upload allowance resets monthly."}
						{/* The date, not just "monthly": being stopped is the moment someone
						    decides whether to pay or to wait, and they can't weigh waiting
						    without knowing how long. */}
						{resetsOn ? ` Resets on ${resetsOn}.` : ""} Markdown, CSV, and text files still import.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>{isPro ? "Close" : "Maybe later"}</AlertDialogCancel>
					{/* "Upgrade" rather than "View plans": this fires where someone has
					    already been stopped, and it should read the same as the other
					    place that stops them. The settings panel keeps "View plans",
					    where nobody is blocked and browsing is the point. */}
					{!isPending && !isPro ? (
						<AlertDialogAction
							nativeButton={false}
							render={<Link replace search={showUpgradeDialog} to="." />}
						>
							Upgrade
						</AlertDialogAction>
					) : null}
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

export function useWorkspaceFileUpload() {
	const context = use(WorkspaceFileUploadContext);

	if (!context) {
		throw new Error("useWorkspaceFileUpload must be used within WorkspaceFileUploadProvider.");
	}

	return context;
}
