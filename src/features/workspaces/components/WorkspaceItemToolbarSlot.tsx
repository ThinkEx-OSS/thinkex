import type { Editor } from "@tiptap/react";
import {
	createContext,
	type Dispatch,
	type ReactNode,
	type SetStateAction,
	use,
	useEffect,
	useState,
} from "react";

import { TooltipProvider } from "#/components/ui/tooltip";
import { DocumentToolbar } from "#/features/workspaces/components/document-editor/DocumentToolbar";
import { WorkspaceFileToolbar } from "#/features/workspaces/components/WorkspaceFileToolbar";

type WorkspaceItemToolbarRegistration =
	| {
			editor: Editor | null;
			kind: "document";
			slotId: string;
	  }
	| {
			capture: {
				isActive: boolean;
				onToggle: () => void;
			};
			fileName: string;
			fileUrl: string;
			kind: "file";
			slotId: string;
	  };

interface WorkspaceItemToolbarContextValue {
	registrationsBySlotId: Record<string, WorkspaceItemToolbarRegistration>;
	setRegistration: Dispatch<SetStateAction<Record<string, WorkspaceItemToolbarRegistration>>>;
}

const WorkspaceItemToolbarContext = createContext<WorkspaceItemToolbarContextValue | null>(null);

export function WorkspaceItemToolbarProvider({ children }: { children: ReactNode }) {
	const [registrationsBySlotId, setRegistration] = useState<
		Record<string, WorkspaceItemToolbarRegistration>
	>({});

	return (
		<WorkspaceItemToolbarContext value={{ registrationsBySlotId, setRegistration }}>
			{children}
		</WorkspaceItemToolbarContext>
	);
}

export function useDocumentEditorToolbar(slotId: string, editor: Editor | null) {
	const context = use(WorkspaceItemToolbarContext);
	const setRegistration = context?.setRegistration;

	useEffect(() => {
		if (!setRegistration) {
			return;
		}

		const registration = { editor, kind: "document" as const, slotId };
		setRegistration((current) => {
			const existing = current[slotId];
			if (
				existing?.kind === "document" &&
				existing.editor === editor &&
				existing.slotId === slotId
			) {
				return current;
			}

			return {
				...current,
				[slotId]: registration,
			};
		});

		return () => {
			setRegistration((current) => {
				if (current[slotId] !== registration) {
					return current;
				}

				const next = { ...current };
				delete next[slotId];

				return next;
			});
		};
	}, [editor, slotId, setRegistration]);
}

export function useFileItemToolbar({
	capture,
	fileName,
	fileUrl,
	slotId,
}: {
	capture: {
		isActive: boolean;
		onToggle: () => void;
	};
	fileName: string;
	fileUrl: string;
	slotId: string;
}) {
	const context = use(WorkspaceItemToolbarContext);
	const setRegistration = context?.setRegistration;

	useEffect(() => {
		if (!setRegistration) {
			return;
		}

		const registration = {
			capture,
			fileName,
			fileUrl,
			kind: "file" as const,
			slotId,
		};
		setRegistration((current) => {
			const existing = current[slotId];
			if (
				existing?.kind === "file" &&
				existing.fileName === fileName &&
				existing.fileUrl === fileUrl &&
				existing.capture.isActive === capture.isActive
			) {
				return current;
			}

			return {
				...current,
				[slotId]: registration,
			};
		});

		return () => {
			setRegistration((current) => {
				if (current[slotId] !== registration) {
					return current;
				}

				const next = { ...current };
				delete next[slotId];

				return next;
			});
		};
	}, [capture, fileName, fileUrl, slotId, setRegistration]);
}

export function WorkspaceItemToolbarSlot({
	activeToolbarSlotId,
}: {
	activeToolbarSlotId?: string;
}) {
	const context = use(WorkspaceItemToolbarContext);
	const registration = activeToolbarSlotId
		? context?.registrationsBySlotId[activeToolbarSlotId]
		: null;

	if (!activeToolbarSlotId || !registration) {
		return null;
	}

	return (
		<div className="flex min-w-0 shrink-0 items-center overflow-hidden">
			<TooltipProvider>
				{registration.kind === "document" ? (
					<DocumentToolbar editor={registration.editor} />
				) : (
					<WorkspaceFileToolbar
						capture={registration.capture}
						fileName={registration.fileName}
						fileUrl={registration.fileUrl}
					/>
				)}
			</TooltipProvider>
		</div>
	);
}
