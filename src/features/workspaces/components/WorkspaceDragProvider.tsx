import { PointerActivationConstraints } from "@dnd-kit/dom";
import { DragDropProvider, KeyboardSensor, PointerSensor } from "@dnd-kit/react";
import type { ReactNode } from "react";
import { useWorkspaceMutationAccess } from "#/features/workspaces/components/workspace-mutation-access";
import type { MoveWorkspaceItemsInput } from "#/features/workspaces/contracts";
import {
	type DndDragEndEvent,
	getWorkspaceDropIntent,
	shouldPreventWorkspacePointerActivation,
	type WorkspaceDragCommand,
} from "#/features/workspaces/model/drag";
import type { WorkspaceItem } from "#/features/workspaces/model/types";

const workspaceDragSensors = [
	PointerSensor.configure({
		activationConstraints(event) {
			if (event.pointerType === "touch") {
				return [
					new PointerActivationConstraints.Delay({
						value: 250,
						tolerance: 5,
					}),
				];
			}

			return [new PointerActivationConstraints.Distance({ value: 6 })];
		},
		preventActivation(event, source) {
			return shouldPreventWorkspacePointerActivation(event, source);
		},
	}),
	KeyboardSensor,
];

interface WorkspaceDragProviderProps {
	children: ReactNode;
	items: WorkspaceItem[];
	workspaceId: string;
	onMoveItems: (input: MoveWorkspaceItemsInput) => void;
	onWorkspaceDragCommand: (command: WorkspaceDragCommand) => void;
}

export default function WorkspaceDragProvider({
	children,
	items,
	workspaceId,
	onMoveItems,
	onWorkspaceDragCommand,
}: WorkspaceDragProviderProps) {
	const { capabilities } = useWorkspaceMutationAccess();
	const handleDragEnd = (event: DndDragEndEvent) => {
		const intent = getWorkspaceDropIntent({
			event,
			items,
			workspaceId,
		});

		if (!intent) {
			return;
		}

		switch (intent.kind) {
			case "workspace-drag-command":
				if (!capabilities.canMutateContent) {
					return;
				}

				onWorkspaceDragCommand(intent.command);
				break;
			case "move-items":
				if (!capabilities.canMutateContent) {
					return;
				}

				onMoveItems(intent.input);
				break;
		}
	};

	return (
		<DragDropProvider sensors={workspaceDragSensors} onDragEnd={handleDragEnd}>
			{children}
		</DragDropProvider>
	);
}
