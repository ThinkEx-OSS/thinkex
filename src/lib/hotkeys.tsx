import { HotkeysProvider } from "@tanstack/react-hotkeys";
import type { ReactNode } from "react";

import { APP_HOTKEY_DEFAULT_OPTIONS } from "#/lib/hotkeys-core";

export function AppHotkeysProvider({ children }: { children: ReactNode }) {
	return <HotkeysProvider defaultOptions={APP_HOTKEY_DEFAULT_OPTIONS}>{children}</HotkeysProvider>;
}
