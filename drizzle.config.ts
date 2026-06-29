import { defineConfig } from "drizzle-kit";

// Migrations are generated here and applied to D1 via
// `wrangler d1 migrations apply` (see package.json db:migrate scripts).
export default defineConfig({
	out: "./drizzle",
	schema: "./src/db/schema.ts",
	dialect: "sqlite",
});
