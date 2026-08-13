import type { Editor } from "@tiptap/react";
import {
	createContext,
	type Dispatch,
	type ReactNode,
	type SetStateAction,
	use,
	useEffect,
	useMemo,
	useState,
} from "react";

import { TooltipProvider } from "#/components/ui/tooltip";
import { DocumentToolbar } from "#/features/workspaces/components/document-editor/DocumentToolbar";
import { FlashcardToolbar } from "#/features/workspaces/components/flashcards/FlashcardToolbar";
import { WorkspaceFileToolbar } from "#/features/workspaces/components/WorkspaceFileToolbar";
import type { FlashcardStudyMode } from "#/features/workspaces/flashcards/flashcard-study-session";

type WorkspaceItemToolbarRegistration =
	| {
			canEdit: boolean;
			documentPath: string;
			editor: Editor | null;
			itemId: string;
			kind: "document";
			slotId: string;
			workspaceId: string;
	  }
	| {
			capture?: {
				isActive: boolean;
				onToggle: () => void;
			};
			fileName: string;
			fileUrl: string;
			kind: "file";
			slotId: string;
	  }
	| {
			canReset: boolean;
			isResetting: boolean;
			kind: "flashcard";
			missedCount: number;
			mode: FlashcardStudyMode;
			onModeChange: (mode: FlashcardStudyMode) => void;
			onReset: () => void;
			onShuffleToggle: () => void;
			shuffled: boolean;
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

export function useDocumentEditorToolbar({
	canEdit,
	documentPath,
	editor,
	itemId,
	slotId,
	workspaceId,
}: {
	canEdit: boolean;
	documentPath: string;
	editor: Editor | null;
	itemId: string;
	slotId: string;
	workspaceId: string;
}) {
	useWorkspaceItemToolbarRegistration(
		useMemo(
			() => ({
				canEdit,
				documentPath,
				editor,
				itemId,
				kind: "document" as const,
				slotId,
				workspaceId,
			}),
			[canEdit, documentPath, editor, itemId, slotId, workspaceId],
		),
	);
}

export function useFileItemToolbar({
	capture,
	fileName,
	fileUrl,
	slotId,
}: {
	capture?: {
		isActive: boolean;
		onToggle: () => void;
	};
	fileName: string;
	fileUrl: string;
	slotId: string;
}) {
	const captureIsActive = capture?.isActive;
	const captureOnToggle = capture?.onToggle;
	useWorkspaceItemToolbarRegistration(
		useMemo(
			() => ({
				capture: captureOnToggle
					? { isActive: Boolean(captureIsActive), onToggle: captureOnToggle }
					: undefined,
				fileName,
				fileUrl,
				kind: "file" as const,
				slotId,
			}),
			[captureIsActive, captureOnToggle, fileName, fileUrl, slotId],
		),
	);
}

export function useFlashcardItemToolbar({
	canReset,
	isResetting,
	missedCount,
	mode,
	onModeChange,
	onReset,
	onShuffleToggle,
	shuffled,
	slotId,
}: {
	canReset: boolean;
	isResetting: boolean;
	missedCount: number;
	mode: FlashcardStudyMode;
	onModeChange: (mode: FlashcardStudyMode) => void;
	onReset: () => void;
	onShuffleToggle: () => void;
	shuffled: boolean;
	slotId: string;
}) {
	useWorkspaceItemToolbarRegistration(
		useMemo(
			() => ({
				canReset,
				isResetting,
				kind: "flashcard" as const,
				missedCount,
				mode,
				onModeChange,
				onReset,
				onShuffleToggle,
				shuffled,
				slotId,
			}),
			[
				canReset,
				isResetting,
				missedCount,
				mode,
				onModeChange,
				onReset,
				onShuffleToggle,
				shuffled,
				slotId,
			],
		),
	);
}

function useWorkspaceItemToolbarRegistration(registration: WorkspaceItemToolbarRegistration) {
	const context = use(WorkspaceItemToolbarContext);
	const setRegistration = context?.setRegistration;

	useEffect(() => {
		if (!setRegistration) return;

		setRegistration((current) =>
			current[registration.slotId] === registration
				? current
				: { ...current, [registration.slotId]: registration },
		);

		return () => {
			setRegistration((current) => {
				if (current[registration.slotId] !== registration) return current;
				const next = { ...current };
				delete next[registration.slotId];
				return next;
			});
		};
	}, [registration, setRegistration]);
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
			<TooltipProvider>{renderWorkspaceItemToolbar(registration)}</TooltipProvider>
		</div>
	);
}

function renderWorkspaceItemToolbar(registration: WorkspaceItemToolbarRegistration) {
	if (registration.kind === "document") {
		return (
			<DocumentToolbar
				canEdit={registration.canEdit}
				documentPath={registration.documentPath}
				editor={registration.editor}
				itemId={registration.itemId}
				workspaceId={registration.workspaceId}
			/>
		);
	}
	if (registration.kind === "file") {
		return (
			<WorkspaceFileToolbar
				capture={registration.capture}
				fileName={registration.fileName}
				fileUrl={registration.fileUrl}
			/>
		);
	}
	return (
		<FlashcardToolbar
			canReset={registration.canReset}
			isResetting={registration.isResetting}
			missedCount={registration.missedCount}
			mode={registration.mode}
			shuffled={registration.shuffled}
			onModeChange={registration.onModeChange}
			onReset={registration.onReset}
			onShuffleToggle={registration.onShuffleToggle}
		/>
	);
}
