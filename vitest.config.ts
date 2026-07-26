import { defineConfig } from "vite-plus/test/config";

export default defineConfig({
	resolve: { tsconfigPaths: true },
	test: {
		include: ["src/**/*.test.{ts,tsx}"],
		exclude: ["src/**/*.worker.test.ts"],
		environment: "node",
	},
});
