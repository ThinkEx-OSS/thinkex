import {
	formatForDisplay,
	type Hotkey,
	type HotkeyCallback,
	type HotkeysProviderOptions,
	type UseHotkeyOptions,
	useHotkey,
} from "@tanstack/react-hotkeys";

type AppHotkeyAction =
	| "workspace.aiChat.toggle"
	| "workspace.item.closeCurrent"
	| "workspace.search.open";

type AppHotkeyDefinition = {
	hotkey: Hotkey;
	description: string;
	scope: "global" | "workspace";
};

const APP_HOTKEYS = {
	"workspace.aiChat.toggle": {
		hotkey: "Mod+J",
		description: "Toggle AI chat",
		scope: "workspace",
	},
	"workspace.item.closeCurrent": {
		hotkey: "Escape",
		description: "Close current workspace item",
		scope: "workspace",
	},
	"workspace.search.open": {
		hotkey: "Mod+K",
		description: "Search workspace",
		scope: "workspace",
	},
} as const satisfies Record<AppHotkeyAction, AppHotkeyDefinition>;

const APP_HOTKEY_DEFAULT_OPTIONS = {
	hotkey: {
		conflictBehavior: "warn",
		eventType: "keydown",
		preventDefault: true,
		stopPropagation: true,
	},
	hotkeySequence: {
		conflictBehavior: "warn",
	},
} as const satisfies HotkeysProviderOptions;

function useAppHotkey(
	action: AppHotkeyAction,
	callback: HotkeyCallback,
	options?: UseHotkeyOptions,
) {
	useHotkey(APP_HOTKEYS[action].hotkey, callback, options);
}

function getAppHotkey(action: AppHotkeyAction) {
	return APP_HOTKEYS[action];
}

function formatAppHotkey(hotkey: Hotkey) {
	return formatForDisplay(hotkey);
}

export type { AppHotkeyAction, AppHotkeyDefinition };
export { APP_HOTKEY_DEFAULT_OPTIONS, formatAppHotkey, getAppHotkey, useAppHotkey };
