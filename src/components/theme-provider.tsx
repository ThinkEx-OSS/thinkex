import { ScriptOnce } from "@tanstack/react-router";
import { createContext, use, useEffect, useState, useSyncExternalStore } from "react";

export type Theme = "dark" | "light" | "system";
export type ResolvedTheme = Exclude<Theme, "system">;

type ThemeProviderProps = {
	children: React.ReactNode;
	defaultTheme?: Theme;
	storageKey?: string;
};

type ThemeProviderState = {
	resolvedTheme: ResolvedTheme;
	theme: Theme;
	setTheme: (theme: Theme) => void;
};

const ThemeProviderContext = createContext<ThemeProviderState>({
	resolvedTheme: "light",
	theme: "system",
	setTheme: () => {},
});

const defaultThemeStorageKey = "theme";

function normalizeThemeStorageKey(storageKey: string) {
	return /^[\w:.-]{1,80}$/.test(storageKey) ? storageKey : defaultThemeStorageKey;
}

function getThemeScript(storageKey: string, defaultTheme: Theme) {
	const key = JSON.stringify(normalizeThemeStorageKey(storageKey));
	const fallback = JSON.stringify(defaultTheme);

	return `(function(){try{var t=localStorage.getItem(${key});if(t!=='light'&&t!=='dark'&&t!=='system'){t=${fallback}}var d=matchMedia('(prefers-color-scheme: dark)').matches;var r=t==='system'?(d?'dark':'light'):t;var e=document.documentElement;e.classList.add(r);e.style.colorScheme=r}catch(e){}})();`;
}

function applyResolvedTheme(resolved: ResolvedTheme) {
	const root = document.documentElement;
	root.classList.remove("light", "dark");
	root.classList.add(resolved);
	root.style.colorScheme = resolved;
}

function subscribeToSystemTheme(onStoreChange: () => void) {
	const media = window.matchMedia("(prefers-color-scheme: dark)");
	media.addEventListener("change", onStoreChange);

	return () => media.removeEventListener("change", onStoreChange);
}

function getSystemThemeSnapshot(): ResolvedTheme {
	return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function getStoredTheme(storageKey: string, defaultTheme: Theme) {
	if (typeof window === "undefined") {
		return defaultTheme;
	}

	const stored = localStorage.getItem(storageKey);

	return stored === "light" || stored === "dark" || stored === "system" ? stored : defaultTheme;
}

export function ThemeProvider({
	children,
	defaultTheme = "system",
	storageKey = defaultThemeStorageKey,
}: ThemeProviderProps) {
	const themeStorageKey = normalizeThemeStorageKey(storageKey);
	const [theme, setThemeState] = useState<Theme>(() =>
		getStoredTheme(themeStorageKey, defaultTheme),
	);
	const systemTheme = useSyncExternalStore(
		subscribeToSystemTheme,
		getSystemThemeSnapshot,
		() => "light" as const,
	);
	const resolvedTheme = theme === "system" ? systemTheme : theme;

	useEffect(() => {
		applyResolvedTheme(resolvedTheme);
	}, [resolvedTheme]);

	const setTheme = (nextTheme: Theme) => {
		localStorage.setItem(themeStorageKey, nextTheme);
		setThemeState(nextTheme);
	};

	return (
		<ThemeProviderContext value={{ resolvedTheme, theme, setTheme }}>
			<ScriptOnce>{getThemeScript(themeStorageKey, defaultTheme)}</ScriptOnce>
			{children}
		</ThemeProviderContext>
	);
}

export function useTheme() {
	const context = use(ThemeProviderContext);

	if (context === undefined) {
		throw new Error("useTheme must be used within a ThemeProvider");
	}

	return context;
}
