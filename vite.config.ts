import type { Plugin } from "vite";
import { defineConfig, lazyPlugins } from "vite-plus";
import {
	assertRequiredPostHogBuildEnv,
	createPostHogBuildPlugin,
} from "#/integrations/posthog/build";

const DECORATOR_BABEL_PLUGIN_NAME = "@rolldown/plugin-babel";
// A decorator is always the first thing on its line, after indentation. The
// filter this replaces is the bare substring "@", which also matches every
// `@scoped/package` import specifier and every `@param` in a JSDoc block.
const DECORATOR_PATTERN = /^[ \t]*@[A-Za-z_$]/m;

/**
 * `agents()` returns `[turndownStub, skillsImport, decoratorBabelPass]`. That
 * last plugin runs `@babel/core` — with no cross-edit cache — on every file whose
 * source contains an `@`, which is 237 of the 738 files under `src/`. Exactly one
 * of them declares a decorator. Swap it for the same transform filtered on an
 * actual decorator so the other 236 stop paying for Babel on every edit.
 */
async function withNarrowedDecoratorFilter(
	babel: (typeof import("@rolldown/plugin-babel"))["default"],
	agentsPlugins: ReturnType<(typeof import("agents/vite"))["default"]>,
) {
	// agents() is typed as returning Plugin[], but it builds the Babel pass with a
	// factory that returns a promise, so one element is genuinely pending.
	const resolved = await Promise.all(
		(agentsPlugins as (Plugin | Promise<Plugin>)[]).map((plugin) => Promise.resolve(plugin)),
	);
	const withoutDecoratorPass = resolved.filter(
		(plugin) => plugin.name !== DECORATOR_BABEL_PLUGIN_NAME,
	);

	if (withoutDecoratorPass.length === resolved.length) {
		throw new Error(
			`Expected agents() to include a "${DECORATOR_BABEL_PLUGIN_NAME}" plugin to replace, but found none. ` +
				"The agents package changed shape — re-check how it lowers decorators before deleting this guard.",
		);
	}

	return [
		...withoutDecoratorPass,
		await babel({
			presets: [
				{
					preset: () => ({
						plugins: [["@babel/plugin-proposal-decorators", { version: "2023-11" }]],
					}),
					rolldown: { filter: { code: DECORATOR_PATTERN } },
				},
			],
		}),
	];
}

export default defineConfig(({ command }) => {
	assertRequiredPostHogBuildEnv(command);
	const cloudflareEnvironment = process.env.CLOUDFLARE_ENV?.trim();
	const shouldGenerateSourceMaps =
		command === "build" &&
		(cloudflareEnvironment === "staging" || cloudflareEnvironment === "production");
	// Set by scripts/run-local-dev.mjs. "lite" is the default dev server: no remote
	// bindings (so nothing bills) and no containers (so no Docker build on start).
	// `pnpm dev --full` opts back into the production-shaped path. Only applies to
	// `vp dev` — builds keep the plugin defaults.
	const isLiteDevServer = command === "serve" && process.env.THINKEX_DEV_PROFILE?.trim() !== "full";

	return {
		resolve: { tsconfigPaths: true },
		build: {
			sourcemap: shouldGenerateSourceMaps,
		},
		run: {
			tasks: {
				ciCheck: "vp check",
				ciTest: "vp test --run",
				ciBuild: {
					command: "node --run build:app",
					untrackedEnv: ["INIT_CWD"],
					input: [{ auto: true }, "!dist/**"],
					output: ["dist/**"],
				},
				ciBuildStaging: {
					command: "node --run build:staging",
					untrackedEnv: ["INIT_CWD"],
					input: [{ auto: true }, "!dist/**"],
					output: ["dist/**"],
				},
			},
		},
		lint: {
			options: {
				typeAware: true,
				typeCheck: true,
			},
			ignorePatterns: [
				".agents/**",
				".claude/**",
				".cursor/**",
				".firecrawl/**",
				".tanstack/**",
				".vite-hooks/**",
				".wrangler/**",
				"dist/**",
				"docs/**",
				"drizzle-postgres/meta/**",
				"src/routeTree.gen.ts",
				"worker-configuration.d.ts",
			],
			plugins: ["react", "typescript"],
			rules: {
				"no-unused-expressions": "off",
				"react/react-compiler": "error",
				"typescript/no-floating-promises": "error",
				"typescript/no-misused-promises": "error",
			},
			overrides: [
				{
					files: ["src/components/ui/cycling-word.tsx"],
					rules: {
						"react/no-array-index-key": "off",
						"react/react-compiler": "off",
						"typescript/no-misused-spread": "off",
					},
				},
				{
					files: ["src/features/workspaces/components/ai-chat/AiChatMessageList.tsx"],
					rules: {
						"react/react-compiler": "off",
					},
				},
			],
		},
		fmt: {
			useTabs: true,
			semi: true,
			singleQuote: false,
			jsxSingleQuote: false,
			ignorePatterns: [
				".agents/**",
				".claude/**",
				".cursor/**",
				".firecrawl/**",
				".tanstack/**",
				".vite-hooks/**",
				".wrangler/**",
				"dist/**",
				"docs/**",
				"drizzle-postgres/meta/**",
				"pnpm-lock.yaml",
				"src/routeTree.gen.ts",
				"worker-configuration.d.ts",
			],
		},
		staged: {
			"*.{js,jsx,ts,tsx,json,jsonc,css,md,yaml,yml}": "vp check --fix",
		},
		ssr: {
			noExternal: ["posthog-js", "@posthog/react"],
		},
		plugins: lazyPlugins(async () => {
			const [
				{ default: babel },
				{ cloudflare },
				{ default: tailwindcss },
				{ default: contentCollections },
				{ devtools },
				{ tanstackStart },
				viteReactModule,
				{ default: agents },
				{ analyzer },
				{ default: posthog },
			] = await Promise.all([
				import("@rolldown/plugin-babel"),
				import("@cloudflare/vite-plugin"),
				import("@tailwindcss/vite"),
				import("@content-collections/vite"),
				import("@tanstack/devtools-vite"),
				import("@tanstack/react-start/plugin/vite"),
				import("@vitejs/plugin-react"),
				import("agents/vite"),
				import("vite-bundle-analyzer"),
				import("@posthog/rollup-plugin"),
			]);

			const plugins = [
				...(command === "serve" ? [devtools()] : []),
				...(process.env.ANALYZE === "true"
					? [
							analyzer({
								analyzerMode: "static",
								fileName: ".analyze/stats",
								openAnalyzer: true,
								summary: true,
							}),
						]
					: []),
				...(command === "build" ? [createPostHogBuildPlugin(posthog)].filter(Boolean) : []),
				contentCollections(),
				...(await withNarrowedDecoratorFilter(babel, agents())),
				cloudflare({
					viteEnvironment: { name: "ssr" },
					// AI, BROWSER, EMAIL and the WORKSPACE_FILES R2 bucket are `remote: true`
					// in wrangler.jsonc, which proxies them to the real account and bills
					// standard operational costs — and delivers real invite email.
					...(isLiteDevServer ? { remoteBindings: false as const } : {}),
					// Skips the getDockerPath/resolveDockerHost branch entirely, so the three
					// container images are neither built nor started.
					...(isLiteDevServer
						? {
								config: (workerConfig) => {
									workerConfig.dev.enable_containers = false;
								},
							}
						: {}),
				}),
				tailwindcss(),
				tanstackStart({
					importProtection: {
						behavior: "error",
						client: {
							specifiers: ["cloudflare:workers", "drizzle-orm/node-postgres", "pg"],
							files: ["src/db/**", "src/lib/auth.server.ts"],
						},
					},
				}),
				viteReactModule.default(),
				babel({ presets: [viteReactModule.reactCompilerPreset()] }),
			];

			return plugins;
		}),
	};
});
