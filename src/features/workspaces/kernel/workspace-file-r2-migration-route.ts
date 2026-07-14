import { getAgentByName } from "agents";

import { workspaceKernelAgentName } from "#/features/workspaces/agent-routes";

const migrationPath = "/api/internal/migrations/workspace-files-r2";
const maximumBatchSize = 25;
const migrationConcurrency = 5;

interface MigrationEnvironment extends Cloudflare.Env {
	WORKSPACE_FILE_R2_MIGRATION_TOKEN: string;
}

interface MigrationRequestBody {
	after?: string;
	limit?: number;
}

export async function routeWorkspaceFileR2Migration(request: Request, environment: Cloudflare.Env) {
	const url = new URL(request.url);

	if (url.pathname !== migrationPath) {
		return null;
	}
	if (request.method !== "POST") {
		return new Response("Method not allowed", { status: 405 });
	}

	const env = environment as MigrationEnvironment;
	const authorization = request.headers.get("authorization");

	if (
		!env.WORKSPACE_FILE_R2_MIGRATION_TOKEN ||
		authorization !== `Bearer ${env.WORKSPACE_FILE_R2_MIGRATION_TOKEN}`
	) {
		return new Response("Unauthorized", { status: 401 });
	}

	const body = (await request.json()) as MigrationRequestBody;
	const after = body.after ?? "";
	const limit = Math.min(Math.max(body.limit ?? maximumBatchSize, 1), maximumBatchSize);
	const query = await env.DB.prepare("SELECT id FROM workspaces WHERE id > ? ORDER BY id LIMIT ?")
		.bind(after, limit)
		.all<{ id: string }>();
	const results = [];

	for (let index = 0; index < query.results.length; index += migrationConcurrency) {
		const batch = query.results.slice(index, index + migrationConcurrency);
		const batchResults = await Promise.all(
			batch.map(async (workspace) => {
				try {
					const kernel = await getAgentByName(env[workspaceKernelAgentName], workspace.id);
					return {
						workspaceId: workspace.id,
						result: await kernel.migrateLegacyFileStorage(),
					};
				} catch (error) {
					return {
						workspaceId: workspace.id,
						error: error instanceof Error ? error.message : String(error),
					};
				}
			}),
		);
		results.push(...batchResults);
	}

	return Response.json({
		done: query.results.length < limit,
		nextAfter: query.results.at(-1)?.id ?? after,
		results,
	});
}
