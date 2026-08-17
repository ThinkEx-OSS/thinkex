import { defineConfig } from "vite-plus/test/config";

/**
 * Database-backed tests, run on demand with `pnpm test:db` against a local
 * Postgres. Kept out of the default suite because CI has no database; without
 * one, ranking and the generated tsvector columns go untested.
 */
export default defineConfig({
	test: {
		projects: [
			{
				resolve: { tsconfigPaths: true },
				test: {
					name: "db",
					include: ["src/**/*.db-test.ts"],
					environment: "node",
					fileParallelism: false,
				},
			},
		],
	},
});
