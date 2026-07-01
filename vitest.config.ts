import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vite-plus/test/config";

export default defineConfig({
	plugins: [
		cloudflareTest({
			remoteBindings: false,
			wrangler: {
				configPath: "./wrangler.test.jsonc",
			},
		}),
	],
	test: {
		include: ["src/**/*.test.ts"],
	},
});
