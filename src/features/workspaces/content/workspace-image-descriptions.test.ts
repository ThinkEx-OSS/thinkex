import { beforeEach, describe, expect, it, vi } from "vitest";

const persistence = vi.hoisted(() => ({
	readWorkspaceFileExtraction: vi.fn(),
}));
const readWorkspacePageProjection = vi.hoisted(() => vi.fn());
const resolveWorkspaceProjectionReadiness = vi.hoisted(() => vi.fn());

vi.mock("#/features/workspaces/persistence/workspace-files", () => ({
	readWorkspaceFileExtraction: persistence.readWorkspaceFileExtraction,
}));
vi.mock("#/features/workspaces/extraction/workspace-page-projection", () => ({
	readWorkspacePageProjection,
}));
vi.mock("#/features/workspaces/extraction/workspace-projection-readiness", () => ({
	resolveWorkspaceProjectionReadiness,
}));

import { annotateWorkspaceImageDescriptions } from "#/features/workspaces/content/workspace-image-descriptions";

describe("annotateWorkspaceImageDescriptions", () => {
	beforeEach(() => {
		persistence.readWorkspaceFileExtraction.mockReset();
		readWorkspacePageProjection.mockReset();
		resolveWorkspaceProjectionReadiness.mockReset();
	});

	it("returns html without image tags untouched and reads nothing", async () => {
		const html = "<p>No images here</p>";
		await expect(annotateWorkspaceImageDescriptions(html, { workspaceId: "w1" })).resolves.toBe(
			html,
		);
		expect(persistence.readWorkspaceFileExtraction).not.toHaveBeenCalled();
	});

	it("writes the stored description as alt text, replacing any stale alt", async () => {
		resolveWorkspaceProjectionReadiness.mockReturnValue({ state: "ready", pageCount: 1 });
		readWorkspacePageProjection.mockResolvedValue({
			content: 'A labeled diagram of the "Krebs" cycle <with arrows>',
		});

		const html = '<p>Before</p><img data-item-id="item-1" alt="old"><p>After</p>';
		await expect(annotateWorkspaceImageDescriptions(html, { workspaceId: "w1" })).resolves.toBe(
			'<p>Before</p><img alt="A labeled diagram of the &quot;Krebs&quot; cycle &lt;with arrows&gt;" data-item-id="item-1"><p>After</p>',
		);
	});

	it("leaves the tag alone while extraction is still pending", async () => {
		resolveWorkspaceProjectionReadiness.mockReturnValue({ state: "pending" });

		const html = '<img data-item-id="item-1" alt="user alt">';
		await expect(annotateWorkspaceImageDescriptions(html, { workspaceId: "w1" })).resolves.toBe(
			html,
		);
	});

	it("truncates long descriptions to one attribute-sized line", async () => {
		resolveWorkspaceProjectionReadiness.mockReturnValue({ state: "ready", pageCount: 1 });
		readWorkspacePageProjection.mockResolvedValue({ content: `${"word ".repeat(200)}end` });

		const result = await annotateWorkspaceImageDescriptions('<img data-item-id="item-1">', {
			workspaceId: "w1",
		});
		const alt = /alt="([^"]*)"/.exec(result)?.[1] ?? "";
		expect(alt.length).toBeLessThanOrEqual(300);
		expect(alt.endsWith("…")).toBe(true);
		expect(alt).not.toContain("\n");
	});

	it("reads each distinct image once and survives a failed read", async () => {
		resolveWorkspaceProjectionReadiness.mockReturnValue({ state: "ready", pageCount: 1 });
		persistence.readWorkspaceFileExtraction.mockImplementation(({ itemId }: { itemId: string }) => {
			if (itemId === "broken") throw new Error("boom");
			return {};
		});
		readWorkspacePageProjection.mockResolvedValue({ content: "A cell" });

		const html =
			'<img data-item-id="a"><img data-item-id="a"><img data-item-id="broken"><img data-item-id="b">';
		const result = await annotateWorkspaceImageDescriptions(html, { workspaceId: "w1" });
		expect(persistence.readWorkspaceFileExtraction).toHaveBeenCalledTimes(3);
		expect(result).toContain('<img alt="A cell" data-item-id="a">');
		expect(result).toContain('<img data-item-id="broken">');
	});
});
