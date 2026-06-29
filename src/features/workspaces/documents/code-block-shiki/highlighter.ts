import { findChildren } from "@tiptap/core";
import type { Node as ProsemirrorNode } from "@tiptap/pm/model";
import {
	createHighlighterCore,
	type HighlighterGeneric,
	type LanguageInput,
	type ThemeInput,
	type ThemeRegistration,
	type ThemedToken,
} from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";

export {
	codeLanguageOptions,
	getCodeLanguageLabel,
	normalizeCodeLanguage,
	type CodeLanguageOption,
	type SupportedCodeLanguage,
} from "#/features/workspaces/documents/code-block-shiki/code-languages";
import {
	normalizeCodeLanguage,
	type SupportedCodeLanguage,
} from "#/features/workspaces/documents/code-block-shiki/code-languages";

export type SupportedCodeTheme = "github-dark" | "github-light";
export type CodeTokenizationResult = {
	bg: string;
	fg: string;
	tokens: ThemedToken[][];
};

type WorkspaceDocumentHighlighter = HighlighterGeneric<SupportedCodeLanguage, SupportedCodeTheme>;
type LanguageModule = { default: LanguageInput };
type ThemeModule = { default: ThemeInput };
type HighlighterOptions = {
	customThemes?: ThemeRegistration[];
	languages: (string | null | undefined)[];
	themes: SupportedCodeTheme[];
};

const languageLoaders: Record<SupportedCodeLanguage, () => Promise<LanguageModule>> = {
	astro: () => import("shiki/langs/astro.mjs"),
	bash: () => import("shiki/langs/bash.mjs"),
	c: () => import("shiki/langs/c.mjs"),
	css: () => import("shiki/langs/css.mjs"),
	cpp: () => import("shiki/langs/cpp.mjs"),
	csharp: () => import("shiki/langs/csharp.mjs"),
	dart: () => import("shiki/langs/dart.mjs"),
	diff: () => import("shiki/langs/diff.mjs"),
	docker: () => import("shiki/langs/docker.mjs"),
	dotenv: () => import("shiki/langs/dotenv.mjs"),
	go: () => import("shiki/langs/go.mjs"),
	graphql: () => import("shiki/langs/graphql.mjs"),
	hcl: () => import("shiki/langs/hcl.mjs"),
	html: () => import("shiki/langs/html.mjs"),
	ini: () => import("shiki/langs/ini.mjs"),
	java: () => import("shiki/langs/java.mjs"),
	javascript: () => import("shiki/langs/javascript.mjs"),
	json: () => import("shiki/langs/json.mjs"),
	jsonc: () => import("shiki/langs/jsonc.mjs"),
	jsx: () => import("shiki/langs/jsx.mjs"),
	kotlin: () => import("shiki/langs/kotlin.mjs"),
	lua: () => import("shiki/langs/lua.mjs"),
	make: () => import("shiki/langs/make.mjs"),
	markdown: () => import("shiki/langs/markdown.mjs"),
	mdx: () => import("shiki/langs/mdx.mjs"),
	php: () => import("shiki/langs/php.mjs"),
	powershell: () => import("shiki/langs/powershell.mjs"),
	python: () => import("shiki/langs/python.mjs"),
	r: () => import("shiki/langs/r.mjs"),
	ruby: () => import("shiki/langs/ruby.mjs"),
	rust: () => import("shiki/langs/rust.mjs"),
	shellscript: () => import("shiki/langs/shellscript.mjs"),
	sql: () => import("shiki/langs/sql.mjs"),
	svelte: () => import("shiki/langs/svelte.mjs"),
	swift: () => import("shiki/langs/swift.mjs"),
	terraform: () => import("shiki/langs/terraform.mjs"),
	toml: () => import("shiki/langs/toml.mjs"),
	tsx: () => import("shiki/langs/tsx.mjs"),
	typescript: () => import("shiki/langs/typescript.mjs"),
	vue: () => import("shiki/langs/vue.mjs"),
	xml: () => import("shiki/langs/xml.mjs"),
	yaml: () => import("shiki/langs/yaml.mjs"),
};
const themeLoaders: Record<SupportedCodeTheme, () => Promise<ThemeModule>> = {
	"github-dark": () => import("shiki/themes/github-dark.mjs"),
	"github-light": () => import("shiki/themes/github-light.mjs"),
};

let highlighter: WorkspaceDocumentHighlighter | undefined;
let highlighterPromise: Promise<void> | undefined;
const loadingLanguages = new Map<SupportedCodeLanguage, Promise<boolean>>();
const loadingThemes = new Map<SupportedCodeTheme, Promise<boolean>>();
const customThemeRegistry = new Map<string, ThemeRegistration>();

export function getShiki() {
	return highlighter;
}

function registerCustomThemes(customThemes?: ThemeRegistration[]) {
	if (!customThemes) {
		return;
	}

	for (const theme of customThemes) {
		if (theme.name) {
			customThemeRegistry.set(theme.name, theme);
		}
	}
}

async function loadConfiguredTheme(theme: SupportedCodeTheme) {
	if (!highlighter || highlighter.getLoadedThemes().includes(theme)) {
		return false;
	}

	const pendingTheme = loadingThemes.get(theme);
	if (pendingTheme) {
		return pendingTheme;
	}

	const themePromise = (async () => {
		const themeModule = await themeLoaders[theme]();
		await highlighter.loadTheme(themeModule.default);
		return true;
	})().finally(() => {
		loadingThemes.delete(theme);
	});

	loadingThemes.set(theme, themePromise);
	return themePromise;
}

async function createWorkspaceDocumentHighlighter(opts: HighlighterOptions) {
	const themes = await Promise.all(
		opts.themes.map(async (theme) => {
			const themeModule = await themeLoaders[theme]();
			return themeModule.default;
		}),
	);

	const instance = await createHighlighterCore({
		engine: createJavaScriptRegexEngine(),
		langs: [],
		themes: [...themes, ...customThemeRegistry.values()],
	});
	highlighter = instance as WorkspaceDocumentHighlighter;
}

async function loadHighlighter(opts: HighlighterOptions) {
	registerCustomThemes(opts.customThemes);

	if (!highlighter && !highlighterPromise) {
		highlighterPromise = createWorkspaceDocumentHighlighter(opts).catch((error) => {
			highlighterPromise = undefined;
			throw error;
		});
		await highlighterPromise;
		await Promise.all(opts.languages.map((language) => loadLanguage(language)));
		return true;
	}

	await highlighterPromise;
	const loadStates = await Promise.all([
		...opts.themes.map((theme) => loadConfiguredTheme(theme)),
		...opts.languages.map((language) => loadLanguage(language)),
	]);

	return loadStates.includes(true);
}

export async function loadLanguage(language: string | null | undefined) {
	const supportedLanguage = normalizeCodeLanguage(language);

	if (!highlighter || !supportedLanguage) {
		return false;
	}

	if (highlighter.getLoadedLanguages().includes(supportedLanguage)) {
		return false;
	}

	const pendingLanguage = loadingLanguages.get(supportedLanguage);
	if (pendingLanguage) {
		return pendingLanguage;
	}

	const languagePromise = (async () => {
		const languageModule = await languageLoaders[supportedLanguage]();
		await highlighter.loadLanguage(languageModule.default);
		return true;
	})().finally(() => {
		loadingLanguages.delete(supportedLanguage);
	});

	loadingLanguages.set(supportedLanguage, languagePromise);
	return languagePromise;
}

export async function highlightCodeTokens({
	code,
	language,
	themes = {
		dark: "github-dark",
		light: "github-light",
	},
}: {
	code: string;
	language: string | null | undefined;
	themes?: {
		dark: SupportedCodeTheme;
		light: SupportedCodeTheme;
	};
}): Promise<CodeTokenizationResult | null> {
	const normalizedLanguage = normalizeCodeLanguage(language);

	if (!normalizedLanguage) {
		return null;
	}

	await loadHighlighter({
		languages: [normalizedLanguage],
		themes: [themes.light, themes.dark],
	});

	if (!highlighter) {
		return null;
	}

	const result = highlighter.codeToTokens(code, {
		lang: normalizedLanguage,
		themes,
	});

	return {
		bg: result.bg ?? "transparent",
		fg: result.fg ?? "inherit",
		tokens: result.tokens,
	};
}

export async function initHighlighter({
	customThemes,
	defaultLanguage,
	doc,
	name,
	themes,
}: {
	customThemes?: ThemeRegistration[];
	defaultLanguage: string | null | undefined;
	doc: ProsemirrorNode;
	name: string;
	themes: {
		dark: SupportedCodeTheme;
		light: SupportedCodeTheme;
	};
}) {
	const codeBlocks = findChildren(doc, (node) => node.type.name === name);
	const languages = [
		...codeBlocks.map((block) => block.node.attrs.language as string),
		defaultLanguage,
	];

	return loadHighlighter({
		customThemes,
		languages,
		themes: [themes.light, themes.dark],
	});
}
