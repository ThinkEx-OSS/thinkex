import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { revokeOAuthConnection } from "#/features/account/connections/oauth-connections.server";
import { withWorkspaceDb } from "#/features/workspaces/server/workspace-db";

const revokeOAuthConnectionInputSchema = z.object({
	consentId: z.string().min(1),
});

export const revokeOAuthConnectionFn = createServerFn({ method: "POST" })
	.validator(revokeOAuthConnectionInputSchema)
	.handler(async ({ data }) =>
		withWorkspaceDb(({ db, userId }) =>
			revokeOAuthConnection(db, {
				consentId: data.consentId,
				userId,
			}),
		),
	);
