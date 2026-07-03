import { getClientOrigin } from "#/lib/client-url";

interface EditorSetupGuide {
	id: string;
	label: string;
	configPath: string;
	notes?: string;
}

export function buildMcpServerConfig(mcpServerUrl: string): string {
	return JSON.stringify(
		{
			mcpServers: {
				thinkex: {
					url: mcpServerUrl,
				},
			},
		},
		null,
		2,
	);
}

export const EDITOR_SETUP_GUIDES: readonly EditorSetupGuide[] = [
	{
		id: "cursor",
		label: "Cursor",
		configPath: "~/.cursor/mcp.json",
	},
	{
		id: "claude-desktop",
		label: "Claude Desktop",
		configPath:
			"~/Library/Application Support/Claude/claude_desktop_config.json (macOS) or %APPDATA%\\Claude\\claude_desktop_config.json (Windows)",
	},
	{
		id: "vscode",
		label: "VS Code",
		configPath: ".vscode/mcp.json in your workspace root",
		notes: "Requires an MCP-capable extension such as Cline, Continue, or GitHub Copilot.",
	},
	{
		id: "windsurf",
		label: "Windsurf",
		configPath: "~/.codeium/windsurf/mcp_config.json",
	},
] as const;

export function getMcpServerUrl(serverMcpServerUrl: string): string {
	const origin = getClientOrigin();

	if (origin) {
		return `${origin}/mcp`;
	}

	return serverMcpServerUrl;
}
