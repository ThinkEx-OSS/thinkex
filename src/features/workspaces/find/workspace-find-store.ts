import { create } from "zustand";
import { devtools } from "zustand/middleware";

import { zustandDevtoolsOptions } from "#/lib/zustand-devtools";

type WorkspaceFindStore = {
	/** Id of the surface whose find bar is open, or null when none is. */
	openFindId: string | null;
	openFind: (findId: string) => void;
	closeFind: () => void;
};

/**
 * Only one find bar is open at a time. Holding that as a single id rather than
 * a boolean per bar means opening one closes the rest by construction, so bars
 * cannot pile up as focus moves between a document, a PDF, and chat.
 */
export const useWorkspaceFindStore = create<WorkspaceFindStore>()(
	devtools(
		(set) => ({
			openFindId: null,
			openFind: (findId) => set({ openFindId: findId }, undefined, "openFind"),
			closeFind: () => set({ openFindId: null }, undefined, "closeFind"),
		}),
		zustandDevtoolsOptions("workspace-find"),
	),
);
