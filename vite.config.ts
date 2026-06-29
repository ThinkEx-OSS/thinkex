import { defineConfig, lazyPlugins } from "vite-plus";
import {
	assertRequiredPostHogBuildEnv,
	createPostHogBuildPlugin,
} from "#/integrations/posthog/build";

export default defineConfig(({ command }) => {
	assertRequiredPostHogBuildEnv(command);

	return {
		resolve: { tsconfigPaths: true },
		build: {
			sourcemap: command === "build",
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
				"drizzle/meta/**",
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
				"drizzle/meta/**",
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
				agents(),
				cloudflare({ viteEnvironment: { name: "ssr" } }),
				tailwindcss(),
				tanstackStart({
					importProtection: {
						behavior: "error",
						client: {
							specifiers: ["cloudflare:workers", "drizzle-orm/d1"],
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
