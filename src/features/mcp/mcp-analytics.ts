import { waitUntil } from "cloudflare:workers";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { instrument, type MCPAnalyticsOptions } from "@posthog/mcp";
import { PostHog } from "posthog-node";

import { posthogHost, posthogProjectToken } from "#/integrations/posthog/config";

const posthogMcpClient =
	posthogProjectToken && posthogHost
		? new PostHog(posthogProjectToken, {
				host: posthogHost,
				waitUntil,
			})
		: null;

/**
 * Adds protocol-level analytics with a dedicated client because the MCP SDK relabels its
 * client globally. Workspace operations retain ownership of backend exception reporting.
 */
export function instrumentMcpAnalytics(server: McpServer, userId: string) {
	if (!posthogMcpClient) {
		return;
	}

	instrument(server, posthogMcpClient, getMcpAnalyticsOptions(userId));
}

export function getMcpAnalyticsOptions(userId: string): MCPAnalyticsOptions {
	return {
		context: {
			description: "Briefly state the user's goal for this tool call.",
		},
		enableExceptionAutocapture: false,
		identify: { distinctId: userId },
	};
}
