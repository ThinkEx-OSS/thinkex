import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vite-plus/test/config";

export default defineConfig({
	plugins: [
		cloudflareTest({
			remoteBindings: false,
			wrangler: {
				configPath: "./wrangler.jsonc",
			},
		}),
	],
	test: {
		include: ["src/**/*.worker.test.ts"],
	},
});
