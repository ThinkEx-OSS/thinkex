import { isAiChatRequestPath, aiChatPathPrefix } from "#/features/workspaces/agent-routes";
import {
	handleAiChatTurn,
	type AiChatRequestBody,
} from "#/features/workspaces/ai/chat/chat-endpoint";
import { chatErrorResponse } from "#/features/workspaces/ai/chat/chat-errors";
import { WorkspaceForbiddenError } from "#/features/workspaces/server/permissions";
import { recordOperationalFailure } from "#/integrations/observability/operational-events";
import { getTelemetryRequestDetails } from "#/integrations/posthog/server-context";
import { getSessionFromRequest } from "#/lib/auth-queries.server";

const threadsPrefix = `${aiChatPathPrefix}/threads/`;

// The chat's one raw Worker route: POST /ai-chat/threads/:threadId streams a
// turn as a UIMessage SSE response, which TanStack server functions can't do.
// Every other read/mutation (thread list, transcript, delete) lives in
// functions.ts as server functions consumed through react-query. Threads are
// never created explicitly — a row materializes on first message.
export async function routeAiChatRequest(request: Request, env: Env, ctx: ExecutionContext) {
	const url = new URL(request.url);

	if (!isAiChatRequestPath(url.pathname)) {
		return null;
	}

	try {
		const session = await getSessionFromRequest(request);

		if (!session?.user) {
			return new Response("Unauthorized", { status: 401 });
		}

		if (!url.pathname.startsWith(threadsPrefix) || request.method !== "POST") {
			return new Response("Not found", { status: 404 });
		}

		const [rawThreadId, subresource] = url.pathname.slice(threadsPrefix.length).split("/");
		const threadId = rawThreadId ? decodeURIComponent(rawThreadId) : "";

		if (!threadId || subresource) {
			return new Response("Not found", { status: 404 });
		}

		const body = (await request.json()) as AiChatRequestBody;

		return await handleAiChatTurn({
			env: env as Cloudflare.Env,
			ctx,
			request,
			threadId,
			userId: session.user.id,
			body,
		});
	} catch (error) {
		const typedResponse = chatErrorResponse(error);

		if (typedResponse) {
			return typedResponse;
		}

		if (error instanceof WorkspaceForbiddenError) {
			return Response.json({ error: "Workspace access denied" }, { status: 403 });
		}

		recordOperationalFailure({
			error,
			event: "pg_ai_chat_route",
			fields: { status_code: 500 },
			request: getTelemetryRequestDetails(request, "pg_ai_chat_route"),
		});

		return Response.json({ error: "Chat is unavailable right now" }, { status: 500 });
	}
}
