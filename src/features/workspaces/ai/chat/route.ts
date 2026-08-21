import { isAiChatRequestPath, aiChatPathPrefix } from "#/features/workspaces/agent-routes";
import {
	handleAiChatTurn,
	type AiChatRequestBody,
} from "#/features/workspaces/ai/chat/chat-endpoint";
import { ChatRequestError, chatErrorResponse } from "#/features/workspaces/ai/chat/chat-errors";
import { stopStream } from "#/features/workspaces/ai/chat/chat-store";
import { WorkspaceForbiddenError } from "#/features/workspaces/server/permissions";
import { recordOperationalFailure } from "#/integrations/observability/operational-events";
import { hasServerAnalyticsConsent } from "#/integrations/posthog/consent.server";
import { getTelemetryRequestDetails } from "#/integrations/posthog/server-context";
import { getSessionFromRequest } from "#/lib/auth-queries.server";

const threadsPrefix = `${aiChatPathPrefix}/threads/`;

// The chat's raw Worker routes: POST /ai-chat/threads/:threadId streams a
// turn as a UIMessage SSE response (which TanStack server functions can't do),
// and POST /ai-chat/threads/:threadId/stop tombstones the thread's stream claim —
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
			// Acknowledge durable stop intent, not completion. The generating Worker
			// observes the tombstone at its next chunk/step boundary; the client keeps
			// the queue blocked on the transcript's active-turn flag until settlement.
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
			threadId,
			userId: session.user.id,
			body,
			// Resolved here, where the request is in hand: the stream callbacks
			// that capture telemetry run after the response, outside any request
			// context a lazy read could fall back to.
			analyticsConsent: hasServerAnalyticsConsent(request.headers),
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

// Total request cap: the message has its own serialized-size cap, but every
// OTHER field (workspace context, future additions) would be unbounded
// without a ceiling on the envelope itself.
const MAX_REQUEST_BODY_CHARS = 2_000_000;

async function parseRequestBody(request: Request): Promise<AiChatRequestBody> {
	// Content-Length first: rejecting before the read means an oversized body
	// is never buffered into memory. The post-read check covers chunked bodies.
	const declaredLength = Number(request.headers.get("content-length") ?? 0);

	if (declaredLength > MAX_REQUEST_BODY_CHARS) {
		throw new ChatRequestError(413, "Request is too large");
	}

	const raw = await request.text();

	if (raw.length > MAX_REQUEST_BODY_CHARS) {
		throw new ChatRequestError(413, "Request is too large");
	}

	let body: unknown;
	try {
		body = JSON.parse(raw);
	} catch {
		throw new ChatRequestError(400, "Request body must be JSON");
	}

	if (typeof body !== "object" || body === null) {
		throw new ChatRequestError(400, "Request body must be a JSON object");
	}

	return body as AiChatRequestBody;
}
