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

import { collectWorkspaceImageDescriptions } from "#/features/workspaces/content/workspace-image-descriptions";

describe("collectWorkspaceImageDescriptions", () => {
	beforeEach(() => {
		persistence.readWorkspaceFileExtraction.mockReset();
		readWorkspacePageProjection.mockReset();
		resolveWorkspaceProjectionReadiness.mockReset();
	});

	it("returns nothing for image-free html and reads nothing", async () => {
		await expect(
			collectWorkspaceImageDescriptions(["<p>No images here</p>"], { workspaceId: "w1" }),
		).resolves.toEqual([]);
		expect(persistence.readWorkspaceFileExtraction).not.toHaveBeenCalled();
	});

	it("returns the stored description per embedded image", async () => {
		resolveWorkspaceProjectionReadiness.mockReturnValue({ state: "ready", pageCount: 1 });
		readWorkspacePageProjection.mockResolvedValue({ content: "A labeled Krebs cycle diagram" });

		await expect(
			collectWorkspaceImageDescriptions(
				['<p>Before</p><img data-item-id="item-1" alt="old"><p>After</p>'],
				{ workspaceId: "w1" },
			),
		).resolves.toEqual([{ itemId: "item-1", description: "A labeled Krebs cycle diagram" }]);
	});

	it("matches a serialized tag whose alt contains a closing angle bracket", async () => {
		resolveWorkspaceProjectionReadiness.mockReturnValue({ state: "ready", pageCount: 1 });
		readWorkspacePageProjection.mockResolvedValue({ content: "A cell" });

		// The serializer emits data-item-id first, so a ">" later in alt (which
		// linkedom does not escape) cannot hide the id from the matcher.
		await expect(
			collectWorkspaceImageDescriptions(['<img data-item-id="item-1" alt="a &gt; b > c">'], {
				workspaceId: "w1",
			}),
		).resolves.toEqual([{ itemId: "item-1", description: "A cell" }]);
	});

	it("omits images whose extraction is still pending", async () => {
		resolveWorkspaceProjectionReadiness.mockReturnValue({ state: "pending" });

		await expect(
			collectWorkspaceImageDescriptions(['<img data-item-id="item-1">'], { workspaceId: "w1" }),
		).resolves.toEqual([]);
	});

	it("truncates long descriptions to one attribute-sized line", async () => {
		resolveWorkspaceProjectionReadiness.mockReturnValue({ state: "ready", pageCount: 1 });
		readWorkspacePageProjection.mockResolvedValue({ content: `${"word ".repeat(200)}end` });

		const [image] = await collectWorkspaceImageDescriptions(['<img data-item-id="item-1">'], {
			workspaceId: "w1",
		});
		expect(image?.description.length).toBeLessThanOrEqual(300);
		expect(image?.description.endsWith("…")).toBe(true);
		expect(image?.description).not.toContain("\n");
	});

	it("reads each distinct image once across strings and survives a failed read", async () => {
		resolveWorkspaceProjectionReadiness.mockReturnValue({ state: "ready", pageCount: 1 });
		persistence.readWorkspaceFileExtraction.mockImplementation(({ itemId }: { itemId: string }) => {
			if (itemId === "broken") throw new Error("boom");
			return {};
		});
		readWorkspacePageProjection.mockResolvedValue({ content: "A cell" });

		const images = await collectWorkspaceImageDescriptions(
			['<img data-item-id="a"><img data-item-id="a">', '<img data-item-id="broken">'],
			{ workspaceId: "w1" },
		);
		expect(persistence.readWorkspaceFileExtraction).toHaveBeenCalledTimes(2);
		expect(images).toEqual([{ itemId: "a", description: "A cell" }]);
	});
});
