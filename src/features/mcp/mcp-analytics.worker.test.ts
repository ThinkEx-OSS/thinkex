import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ListToolsResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { instrument } from "@posthog/mcp";
import { createMcpHandler } from "agents/mcp";
import { PostHog, type EventMessage } from "posthog-node";
import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { getMcpAnalyticsOptions } from "#/features/mcp/mcp-analytics";
import { mcpHandlerOptions } from "#/features/mcp/mcp-config";

interface CapturedEvent {
	distinctId: string;
	event: string;
	properties: Record<string, unknown>;
}

class CapturingPostHog extends PostHog {
	readonly capturedEvents: CapturedEvent[] = [];

	constructor() {
		super("phc_test", { flushInterval: 0, host: "https://us.i.posthog.com" });
	}

	override capture(event: EventMessage) {
		this.capturedEvents.push({
			distinctId: event.distinctId ?? "",
			event: event.event,
			properties: event.properties ?? {},
		});
	}
}

let mcpClient: CapturingPostHog;

function createInstrumentedServer() {
	const server = new McpServer({ name: "ThinkEx Test", version: "1.0.0" });
	server.registerTool(
		"ping",
		{
			description: "Return the supplied message.",
			inputSchema: { message: z.string() },
		},
		async ({ message }) => ({ content: [{ type: "text", text: message }] }),
	);
	server.registerTool(
		"fail",
		{
			description: "Throw a deterministic test error.",
			inputSchema: {},
		},
		async () => {
			throw new Error("Expected MCP test failure");
		},
	);
	instrument(server, mcpClient, getMcpAnalyticsOptions("user-123"));
	return server;
}

async function dispatchMcpRequest(method: string, params: object, sessionId?: string) {
	const backgroundTasks: Promise<unknown>[] = [];
	const ctx = {
		passThroughOnException() {},
		props: {},
		waitUntil(task: Promise<unknown>) {
			backgroundTasks.push(task);
		},
	} as unknown as ExecutionContext;
	const headers = new Headers({
		accept: "application/json, text/event-stream",
		"content-type": "application/json",
	});
	if (sessionId) {
		headers.set("mcp-session-id", sessionId);
	}

	const response = await createMcpHandler(createInstrumentedServer(), mcpHandlerOptions)(
		new Request("https://thinkex.test/mcp", {
			method: "POST",
			headers,
			body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
		}),
		{},
		ctx,
	);
	await Promise.all(backgroundTasks);
	return response;
}

describe("MCP analytics", () => {
	beforeEach(() => {
		mcpClient = new CapturingPostHog();
	});

	it("keeps the application-wide PostHog client isolated", () => {
		const applicationClient = new PostHog("phc_application", {
			flushInterval: 0,
			host: "https://us.i.posthog.com",
		});
		const applicationLibraryId = applicationClient.getLibraryId();

		createInstrumentedServer();

		expect(applicationClient.getLibraryId()).toBe(applicationLibraryId);
		expect(applicationLibraryId).not.toBe("posthog-node-mcp");
		expect(mcpClient.getLibraryId()).toBe("posthog-node-mcp");
	});

	it("preserves sessions and attributes authenticated tool calls across stateless requests", async () => {
		const initializeResponse = await dispatchMcpRequest("initialize", {
			protocolVersion: "2025-06-18",
			capabilities: {},
			clientInfo: { name: "test-client", version: "1.0.0" },
		});

		expect(initializeResponse.status).toBe(200);
		expect(initializeResponse.headers.get("content-type")).toContain("application/json");
		const sessionId = initializeResponse.headers.get("mcp-session-id");
		expect(sessionId).toBeTruthy();

		const toolsResponse = await dispatchMcpRequest("tools/list", {}, sessionId ?? undefined);
		expect(toolsResponse.status).toBe(200);

		const toolsResult = z
			.object({ result: ListToolsResultSchema })
			.parse(await toolsResponse.json()).result;
		const pingTool = toolsResult.tools.find((tool) => tool.name === "ping");
		expect(pingTool?.inputSchema.required).toContain("context");
		expect(pingTool?.inputSchema.properties?.context).toEqual(
			expect.objectContaining({ type: "string" }),
		);

		const toolCallResponse = await dispatchMcpRequest(
			"tools/call",
			{
				name: "ping",
				arguments: { context: "Verify MCP analytics", message: "pong" },
			},
			sessionId ?? undefined,
		);
		expect(toolCallResponse.status).toBe(200);

		const failedToolResponse = await dispatchMcpRequest(
			"tools/call",
			{
				name: "fail",
				arguments: { context: "Verify failure analytics" },
			},
			sessionId ?? undefined,
		);
		expect(failedToolResponse.status).toBe(200);

		await expect
			.poll(() =>
				mcpClient.capturedEvents.filter(({ event }) =>
					["$mcp_initialize", "$mcp_tools_list", "$mcp_tool_call"].includes(event),
				),
			)
			.toHaveLength(4);

		const initializeEvent = mcpClient.capturedEvents.find(
			({ event }) => event === "$mcp_initialize",
		);
		const toolsListEvent = mcpClient.capturedEvents.find(
			({ event }) => event === "$mcp_tools_list",
		);
		const toolCallEvent = mcpClient.capturedEvents.find(({ event }) => event === "$mcp_tool_call");
		const failedToolEvent = mcpClient.capturedEvents.find(
			({ event, properties }) => event === "$mcp_tool_call" && properties.$mcp_is_error === true,
		);
		expect(initializeEvent?.distinctId).toBe("user-123");
		expect(toolCallEvent?.distinctId).toBe("user-123");
		expect(toolsListEvent?.properties.$session_id).toBe(initializeEvent?.properties.$session_id);
		expect(toolCallEvent?.properties.$session_id).toBe(initializeEvent?.properties.$session_id);
		expect(toolCallEvent?.properties.$mcp_client_name).toBe("test-client");
		expect(toolCallEvent?.properties.$mcp_client_version).toBe("1.0.0");
		expect(toolCallEvent?.properties.$mcp_intent).toBe("Verify MCP analytics");
		expect(failedToolEvent?.distinctId).toBe("user-123");
		expect(failedToolEvent?.properties.$mcp_tool_name).toBe("fail");
		expect(failedToolEvent?.properties.$mcp_error_message).toBe("Expected MCP test failure");
		expect(mcpClient.capturedEvents.some(({ event }) => event === "$exception")).toBe(false);
	});
});
