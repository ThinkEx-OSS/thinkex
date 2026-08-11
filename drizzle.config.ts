import { defineConfig } from "drizzle-kit";

const databaseUrl = process.env.DATABASE_URL?.trim();

export default defineConfig({
	out: "./drizzle-postgres",
	schema: "./src/db/schema.ts",
	dialect: "postgresql",
	...(databaseUrl ? { dbCredentials: { url: databaseUrl } } : {}),
});
