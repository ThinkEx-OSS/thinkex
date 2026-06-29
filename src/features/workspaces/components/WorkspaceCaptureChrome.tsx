import { useWorkspacePaneHotkey } from "#/features/workspaces/components/WorkspacePaneRuntime";

const captureViewerFrameClassName =
	"pointer-events-none absolute inset-0 z-30 ring-[3px] ring-inset ring-blue-600";
const activeWorkspaceCaptureSelector = "[data-workspace-capture-active]";

export function WorkspaceCaptureViewerFrame({ active }: { active: boolean }) {
	if (!active) {
		return null;
	}

	return (
		<div aria-hidden className={captureViewerFrameClassName} data-workspace-capture-active="" />
	);
}

export function hasActiveWorkspaceCapture() {
	return Boolean(document.querySelector(activeWorkspaceCaptureSelector));
}

export function WorkspaceCaptureShortcuts({
	isActive,
	onExit,
	onToggle,
}: {
	isActive: boolean;
	onExit: () => void;
	onToggle: () => void;
}) {
	useWorkspacePaneHotkey(
		"Mod+Shift+X",
		(event) => {
			event.preventDefault();
			onToggle();
		},
		{
			ignoreInputs: true,
			preventDefault: false,
			stopPropagation: true,
		},
	);

	useWorkspacePaneHotkey(
		"Escape",
		(event) => {
			event.preventDefault();
			onExit();
		},
		{
			conflictBehavior: "allow",
			enabled: isActive,
			ignoreInputs: true,
			preventDefault: false,
			stopPropagation: true,
		},
	);

	return null;
}
