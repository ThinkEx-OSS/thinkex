import { and, eq } from "drizzle-orm";

import { oauthConsent } from "#/db/schema";
import { createDbContext } from "#/db/server";
import { type McpActor, McpAuthError } from "./mcp-auth";

export async function assertMcpConnectionAuthorized(actor: McpActor): Promise<void> {
	if (!actor.clientId) {
		throw new McpAuthError(401, "invalid_token");
	}

	const dbContext = await createDbContext();

	try {
		const [consent] = await dbContext.db
			.select({ id: oauthConsent.id })
			.from(oauthConsent)
			.where(and(eq(oauthConsent.clientId, actor.clientId), eq(oauthConsent.userId, actor.userId)))
			.limit(1);

		if (!consent) {
			throw new McpAuthError(401, "invalid_token");
		}
	} finally {
		await dbContext.dispose();
	}
}
