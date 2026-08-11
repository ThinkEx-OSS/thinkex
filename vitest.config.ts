import { fileURLToPath } from "node:url";

import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import agents from "agents/vite";
import { defineConfig } from "vite-plus/test/config";

// Miniflare validates every declared binding before starting a worker test.
// These tests do not query Postgres, so a syntactically valid, non-routable
// local URL is sufficient; real app tests supply the isolated Conductor URL.
process.env.CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE ??=
	"postgresql://test:test@127.0.0.1:1/thinkex_test";

export default defineConfig({
	test: {
		projects: [
			{
				resolve: { tsconfigPaths: true },
				test: {
					name: "node",
					include: ["src/**/*.test.{ts,tsx}"],
					exclude: ["src/**/*.worker.test.ts"],
					environment: "node",
				},
			},
			{
				resolve: {
					tsconfigPaths: true,
					alias: {
						// Durable Object tests do not exercise the separate global relational
						// plane. Keep node-postgres out of their workerd-only module graph.
						"#/db/server": fileURLToPath(new URL("./test/stubs/db-server.ts", import.meta.url)),
						// Worker tests drive Durable Objects and server modules directly,
						// with no TanStack request in scope. The real module would drag the
						// Start server handler and its build-time virtual entries in with it.
						"@tanstack/react-start/server": fileURLToPath(
							new URL("./test/stubs/tanstack-start-server.ts", import.meta.url),
						),
					},
				},
				plugins: [
					// Agent classes use TC39 decorators, which Oxc cannot transform yet.
					// The app build leans on this same plugin to lower them.
					agents(),
					cloudflareTest({
						// The app entry serves the TanStack router, which tests never
						// exercise. A handler-free entry keeps that build out of the graph.
						main: "./test/worker-entry.ts",
						remoteBindings: false,
						wrangler: { configPath: "./wrangler.jsonc" },
					}),
				],
				test: {
					name: "workers",
					include: ["src/**/*.worker.test.ts"],
				},
			},
		],
	},
});
