import { type RefObject, useState } from "react";

import { useWorkspacePaneHotkey } from "#/features/workspaces/components/WorkspacePaneRuntime";
import { getAppHotkey } from "#/lib/hotkeys-core";

/**
 * Open state, the query, and the hotkey — everything about finding that does
 * not depend on what is being searched. Call this beside a surface's engine
 * hook and hand both to {@link WorkspaceFindBar}.
 */
export function useWorkspaceFind({
	hotkeyTarget,
}: {
	/** Scopes the hotkey to one element. Surfaces that own a pane omit it. */
	hotkeyTarget?: RefObject<HTMLElement | null>;
} = {}) {
	const [isOpen, setIsOpen] = useState(false);
	const [rawQuery, setRawQuery] = useState("");
	const [caseSensitive, setCaseSensitive] = useState(false);
	// Bumped on every open request so the bar re-focuses its input even when it
	// was already showing.
	const [openCount, setOpenCount] = useState(0);

	const open = () => {
		setIsOpen(true);
		setOpenCount((count) => count + 1);
	};
	const close = () => {
		setIsOpen(false);
		setRawQuery("");
	};

	useWorkspacePaneHotkey(getAppHotkey("workspace.find.open").hotkey, open, {
		conflictBehavior: "allow",
		target: hotkeyTarget,
	});

	return {
		caseSensitive,
		close,
		isOpen,
		open,
		openCount,
		// Normalized once here so every surface agrees on what "empty" means and
		// searches exactly what was typed. Engines never trim.
		query: rawQuery.trim() === "" ? "" : rawQuery,
		rawQuery,
		setQuery: setRawQuery,
		toggleCaseSensitive: () => setCaseSensitive((current) => !current),
	};
}

export type WorkspaceFindState = ReturnType<typeof useWorkspaceFind>;
