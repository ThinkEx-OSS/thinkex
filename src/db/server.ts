import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";

import * as schema from "./schema";

type DatabaseBindings = Pick<Cloudflare.Env, "HYPERDRIVE">;

function getPostgresConnectionString(bindings: DatabaseBindings) {
	const connectionString = bindings.HYPERDRIVE?.connectionString;

	if (!connectionString) {
		throw new Error(
			"No Postgres database is configured. Cloudflare Worker deployments use the HYPERDRIVE binding.",
		);
	}

	return connectionString;
}

export async function createDbContext(bindings: DatabaseBindings = env) {
	const client = new Client({ connectionString: getPostgresConnectionString(bindings) });
	await client.connect();

	return {
		db: drizzle(client, { schema }),
		dispose: async () => client.end(),
	};
}
