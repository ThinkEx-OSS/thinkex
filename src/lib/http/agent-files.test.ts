import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("agent-facing files", () => {
	it("explicitly permits search, AI answers, training, and reuse", async () => {
		const body = await readFile(new URL("../../../public/robots.txt", import.meta.url), "utf8");

		expect(body).toContain("Content-Signal: search=yes, ai-input=yes, ai-train=yes, use=full");
		expect(body).not.toContain("Disallow: /");
	});

	it("publishes a spec-shaped llms.txt with named developer resources", async () => {
		const body = await readFile(new URL("../../../public/llms.txt", import.meta.url), "utf8");

		expect(body.startsWith("# ThinkEx\n\n> ")).toBe(true);
		expect(body).toContain("## Developers and agents\n\n- [ThinkEx developer resources]");
		expect(body).toContain("[ThinkEx MCP server](https://docs.thinkex.app/guides/mcp.md)");
	});
});
