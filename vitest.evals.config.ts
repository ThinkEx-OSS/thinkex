import { fileURLToPath } from "node:url";

import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import agents from "agents/vite";
import { defineConfig } from "vite-plus/test/config";

// Evals exercise the real workspace tool surface (schemas + descriptions) and the
// real gateway model wiring. That code is worker-runtime code — it imports the
// kernel, Durable Objects, and `cloudflare:workers` — so, exactly like the app's
// own `*.worker.test.ts`, evals run in the Cloudflare workers pool rather than
// Node. This gives us the real modules with no stubbing.
//
// They live in their own config so they never run in the normal `pnpm test`
// pipeline: they hit real models (real latency + spend). Run them on demand with
// `pnpm eval`, which injects AI_GATEWAY_API_KEY (via Infisical) into the pool.

// Miniflare validates every declared binding before starting; evals never
// query Postgres (tool execution is stubbed), so a syntactically valid,
// non-routable URL satisfies the Hyperdrive binding (same as vitest.config.ts).
process.env.CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE ??=
	"postgresql://test:test@127.0.0.1:1/thinkex_test";

export default defineConfig({
	test: {
		projects: [
			{
				resolve: {
					tsconfigPaths: true,
					alias: {
						// Evals never touch the relational plane; keep node-postgres (a CJS
						// package the workers module runner can't shim) out of the graph.
						// Same stub as the app's workers test project.
						"#/db/server": fileURLToPath(new URL("./test/stubs/db-server.ts", import.meta.url)),
						// The worker entry pulls in the TanStack Start server handler, whose
						// build-time virtual specifiers don't resolve under Vitest. The app's
						// own workers project stubs it the same way.
						"@tanstack/react-start/server": fileURLToPath(
							new URL("./test/stubs/tanstack-start-server.ts", import.meta.url),
						),
					},
				},
				plugins: [
					// Agent classes use TC39 decorators that Oxc can't transform yet; this
					// plugin lowers them (same as the app build and workers test project).
					agents(),
					cloudflareTest({
						main: "./test/worker-entry.ts",
						remoteBindings: false,
						wrangler: { configPath: "./wrangler.jsonc" },
						// AI_GATEWAY_API_KEY is a secret, so it isn't in wrangler vars. Inject
						// it from the process env (Infisical supplies it under `pnpm eval`) so
						// the real gateway wiring can authenticate.
						miniflare: {
							bindings: { AI_GATEWAY_API_KEY: process.env.AI_GATEWAY_API_KEY ?? "" },
						},
					}),
				],
				test: {
					name: "evals",
					include: ["eval/**/*.eval.ts"],
					// Real model turns are slow; give them room.
					testTimeout: 120_000,
					hookTimeout: 120_000,
				},
			},
		],
	},
});
