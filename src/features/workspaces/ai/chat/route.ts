import { isAiChatRequestPath, aiChatPathPrefix } from "#/features/workspaces/agent-routes";
import {
	handleAiChatTurn,
	type AiChatRequestBody,
} from "#/features/workspaces/ai/chat/chat-endpoint";
import { ChatRequestError, chatErrorResponse } from "#/features/workspaces/ai/chat/chat-errors";
import { stopStream } from "#/features/workspaces/ai/chat/chat-store";
import { WorkspaceForbiddenError } from "#/features/workspaces/server/permissions";
import { recordOperationalFailure } from "#/integrations/observability/operational-events";
import { getTelemetryRequestDetails } from "#/integrations/posthog/server-context";
import { getSessionFromRequest } from "#/lib/auth-queries.server";

const threadsPrefix = `${aiChatPathPrefix}/threads/`;

// The chat's raw Worker routes: POST /ai-chat/threads/:threadId streams a
// turn as a UIMessage SSE response (which TanStack server functions can't do),
// and POST /ai-chat/threads/:threadId/stop clears the thread's stream claim —
// the generating isolate notices on its next ping and aborts. Every other
// read/mutation lives in functions.ts as server functions consumed through
// react-query. Threads are never created explicitly — a row materializes on
// first message.
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

		const [rawThreadId, subresource, ...rest] = url.pathname.slice(threadsPrefix.length).split("/");
		const threadId = rawThreadId && rest.length === 0 ? safeDecodeUriComponent(rawThreadId) : "";

		if (!threadId) {
			return new Response("Not found", { status: 404 });
		}

		if (subresource === "stop") {
			await stopStream({ threadId, userId: session.user.id });
			return Response.json({ ok: true });
		}

		if (subresource) {
			return new Response("Not found", { status: 404 });
		}

		const body = await parseRequestBody(request);

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

// Client-input parsing must surface as 4xx, not as a 500 plus a false
// operational-failure event: malformed percent-encoding and malformed JSON
// are caller mistakes, and the catch above treats anything untyped as a fault.
function safeDecodeUriComponent(value: string): string {
	try {
		return decodeURIComponent(value);
	} catch {
		return "";
	}
}

async function parseRequestBody(request: Request): Promise<AiChatRequestBody> {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw new ChatRequestError(400, "Request body must be JSON");
	}

	if (typeof body !== "object" || body === null) {
		throw new ChatRequestError(400, "Request body must be a JSON object");
	}

	return body as AiChatRequestBody;
}
