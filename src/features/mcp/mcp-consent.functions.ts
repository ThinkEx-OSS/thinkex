import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { z } from "zod";

import { withAuth } from "#/lib/auth.server";

const consentContextInputSchema = z.object({
	clientId: z.string().min(1),
});

function getClientDisplayName(clientName: string | undefined) {
	const normalizedName = clientName?.trim().replace(/\s+/g, " ");
	return normalizedName ? normalizedName.slice(0, 80) : "MCP client";
}

export const getMcpConsentContextFn = createServerFn({ method: "GET" })
	.validator(consentContextInputSchema)
	.handler(async ({ data }) => {
		const headers = getRequestHeaders();

		return await withAuth(async (auth) => {
			const [client, session] = await Promise.all([
				auth.api.getOAuthClientPublic({
					headers,
					query: { client_id: data.clientId },
				}),
				auth.api.getSession({ headers }),
			]);

			return {
				clientName: getClientDisplayName(client.client_name),
				userEmail: session?.user.email ?? null,
			};
		});
	});
