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

interface WorkspaceItemToolbarRegistration {
	content: ReactNode;
	slotId: string;
}

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

export function useWorkspaceItemToolbar(slotId: string, content: ReactNode) {
	const registration = useMemo(() => ({ content, slotId }), [content, slotId]);
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

	if (!registration) return null;

	return (
		<div className="flex min-w-0 shrink-0 items-center overflow-hidden">
			<TooltipProvider>{registration.content}</TooltipProvider>
		</div>
	);
}
