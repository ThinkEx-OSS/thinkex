import { getAgentByName } from "agents";
import { timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";

import { legacyDataMigrations } from "#/db/schema";
import { createDbContext } from "#/db/server";
import { workspaceKernelAgentName } from "#/features/workspaces/agent-routes";

const routePattern = /^\/api\/internal\/migrations\/postgres\/workspaces\/([^/]+)$/;

let cutoverReady = false;

export async function routeLegacyWorkspaceMigration(request: Request, env: Cloudflare.Env) {
	const match = new URL(request.url).pathname.match(routePattern);
	if (!match) return null;

	if (!env.POSTGRES_MIGRATION_TOKEN) return new Response("Not found", { status: 404 });
	if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
	if (!hasValidToken(request, env.POSTGRES_MIGRATION_TOKEN)) {
		return new Response("Unauthorized", { status: 401 });
	}
	if (await isPostgresCutoverReady(env)) return new Response("Not found", { status: 404 });

	const workspaceId = decodeURIComponent(match[1]);
	const kernel = await getAgentByName(env[workspaceKernelAgentName], workspaceId);
	return Response.json(await kernel.migrateLegacyDataToPostgres());
}

export async function isPostgresMigrationMaintenance(env: Cloudflare.Env) {
	return Boolean(env.POSTGRES_MIGRATION_TOKEN) && !(await isPostgresCutoverReady(env));
}

export async function isPostgresCutoverReady(env: Cloudflare.Env) {
	if (env.REQUIRE_LEGACY_DATA_MIGRATION !== "true" && !env.POSTGRES_MIGRATION_TOKEN) {
		return true;
	}
	if (cutoverReady) return true;
	cutoverReady = await readCutoverMarker(env);
	return cutoverReady;
}

async function readCutoverMarker(env: Cloudflare.Env) {
	const context = await createDbContext(env);
	try {
		const [marker] = await context.db
			.select({ scope: legacyDataMigrations.scope })
			.from(legacyDataMigrations)
			.where(eq(legacyDataMigrations.scope, "cutover"))
			.limit(1);
		return Boolean(marker);
	} finally {
		await context.dispose();
	}
}

function hasValidToken(request: Request, expected: string) {
	const authorization = request.headers.get("authorization");
	const actual = authorization?.match(/^Bearer\s+(.+)$/i)?.[1] ?? "";
	const actualBytes = Buffer.from(actual);
	const expectedBytes = Buffer.from(expected);
	return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}
