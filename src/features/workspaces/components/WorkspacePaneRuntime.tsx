import {
	type Hotkey,
	type HotkeyCallback,
	type UseHotkeyOptions,
	useHotkey,
} from "@tanstack/react-hotkeys";
import { createContext, type ReactNode, use } from "react";

type WorkspacePaneRuntimeValue = {
	isActive: boolean;
	onCloseItemView?: () => void;
};

const WorkspacePaneRuntimeContext = createContext<WorkspacePaneRuntimeValue | null>(null);

function WorkspacePaneRuntimeProvider({
	children,
	isActive,
	onCloseItemView,
}: {
	children: ReactNode;
	isActive: boolean;
	onCloseItemView?: () => void;
}) {
	return (
		<WorkspacePaneRuntimeContext value={{ isActive, onCloseItemView }}>
			{children}
		</WorkspacePaneRuntimeContext>
	);
}

function useWorkspacePaneRuntime() {
	return use(WorkspacePaneRuntimeContext);
}

function useWorkspacePaneHotkey(
	hotkey: Hotkey,
	callback: HotkeyCallback,
	options?: UseHotkeyOptions,
) {
	const runtime = useWorkspacePaneRuntime();
	const isActive = runtime?.isActive ?? true;
	const { enabled = true, ...hotkeyOptions } = options ?? {};

	useHotkey(
		hotkey,
		(event, context) => {
			if (!isActive) {
				return;
			}

			callback(event, context);
		},
		{
			...hotkeyOptions,
			enabled: isActive && enabled,
		},
	);
}

export { useWorkspacePaneHotkey, useWorkspacePaneRuntime, WorkspacePaneRuntimeProvider };
