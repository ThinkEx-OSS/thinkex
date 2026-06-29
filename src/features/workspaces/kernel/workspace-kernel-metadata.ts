import type { JsonValue } from "#/features/workspaces/contracts";

export function parseWorkspaceItemMetadataJson(value: string): Record<string, JsonValue> {
	try {
		const parsed = JSON.parse(value) as unknown;

		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
			return {};
		}

		return parsed as Record<string, JsonValue>;
	} catch {
		return {};
	}
}
