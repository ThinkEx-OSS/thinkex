import { useCallback, useEffect, useState } from "react";

import {
	createWorkspaceClipboardIntake,
	type WorkspaceClipboardIntake,
} from "#/features/workspaces/clipboard/workspace-clipboard-intake";
import { useWorkspaceFileIntake } from "#/features/workspaces/components/WorkspaceFileIntakeProvider";
import { useWorkspacePaneRuntime } from "#/features/workspaces/components/WorkspacePaneRuntime";
import { useCreateWorkspaceItemMutation } from "#/features/workspaces/use-workspace-kernel-items";
import { isEditableEventTarget, isOpenPopupInteractionTarget } from "#/lib/keyboard-event-target";

export function useWorkspaceClipboardIntake({
	enabled,
	parentId,
	workspaceId,
}: {
	enabled: boolean;
	parentId: string | null;
	workspaceId: string;
}) {
	const createItem = useCreateWorkspaceItemMutation();
	const { uploadFiles } = useWorkspaceFileIntake();
	const paneRuntime = useWorkspacePaneRuntime();
	const isActive = paneRuntime?.isActive ?? true;
	const [intake, setIntake] = useState<WorkspaceClipboardIntake | null>(null);

	useEffect(() => {
		if (!enabled || !isActive) {
			return;
		}

		const handlePaste = (event: ClipboardEvent) => {
			if (shouldIgnorePasteEvent(event) || !event.clipboardData) {
				return;
			}

			const nextIntake = createWorkspaceClipboardIntake(event.clipboardData);

			if (!nextIntake) {
				return;
			}

			event.preventDefault();
			setIntake(nextIntake);
		};

		document.addEventListener("paste", handlePaste);

		return () => {
			document.removeEventListener("paste", handlePaste);
		};
	}, [enabled, isActive]);

	const close = useCallback(() => setIntake(null), []);
	const confirm = useCallback(() => {
		if (!intake) {
			return;
		}

		if (intake.document) {
			createItem.mutate({
				id: crypto.randomUUID(),
				workspaceId,
				parentId,
				type: "document",
				name: intake.document.name,
				initialContent: intake.document.initialContent,
			});
		}

		if (intake.files.length > 0) {
			uploadFiles(intake.files, parentId);
		}

		setIntake(null);
	}, [createItem, intake, parentId, uploadFiles, workspaceId]);

	return {
		confirm,
		intake,
		open: Boolean(intake),
		setOpen: (open: boolean) => {
			if (!open) {
				close();
			}
		},
	};
}

function shouldIgnorePasteEvent(event: ClipboardEvent) {
	for (const target of event.composedPath()) {
		if (isEditableEventTarget(target) || isOpenPopupInteractionTarget(target)) {
			return true;
		}
	}

	return false;
}
