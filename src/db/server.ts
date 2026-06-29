import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";

import * as schema from "./schema";

function getD1Database() {
	const database = env.DB;

	if (!database) {
		throw new Error(
			"No D1 database is configured. Cloudflare Worker deployments use the DB binding.",
		);
	}

	return database;
}

export async function createDbContext() {
	return {
		db: drizzle(getD1Database(), { schema }),
		// D1 is connectionless — disposal is a no-op kept for call-site compatibility.
		dispose: async () => {},
	};
}
