import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AiChatMessageResponse } from "#/features/workspaces/components/ai-chat/AiChatMessageResponse";
import type { WorkspaceReference } from "#/features/workspaces/locations/workspace-location";
import { WorkspaceLocationProvider } from "#/features/workspaces/locations/workspace-location-context";
import type { WorkspaceItem } from "#/features/workspaces/model/types";

const documentItem: WorkspaceItem = {
	color: null,
	createdAt: "2026-01-01T00:00:00.000Z",
	deletedAt: null,
	id: "document-1",
	meta: "Document",
	metadataJson: {},
	name: "Research Notes",
	parentId: null,
	sortOrder: 1,
	title: "Research Notes",
	type: "document",
	updatedAt: "2026-01-01T00:00:00.000Z",
	workspaceId: "workspace-1",
};

describe("AI chat message response citations", () => {
	it("renders a validated citation as an app-owned source button", () => {
		const ref = "wr_AAAAAAAA" as WorkspaceReference;
		const html = renderToStaticMarkup(
			<WorkspaceLocationProvider itemsById={new Map()} reveal={() => false}>
				<AiChatMessageResponse
					workspaceCitationLocations={
						new Map([
							[
								ref,
								{
									itemId: "missing-pdf",
									kind: "pdf-page",
									pageNumber: 12,
									version: 1,
								},
							],
						])
					}
				>
					{`Claim <citation ref="${ref}"></citation>`}
				</AiChatMessageResponse>
			</WorkspaceLocationProvider>,
		);

		expect(html).toContain("<button");
		expect(html).toContain("Open Source unavailable · p. 12");
		expect(html).toContain("Source unavailable · p. 12");
		expect(html).not.toContain("<citation");
	});

	it("reuses the workspace item's icon and color", () => {
		const ref = "wr_BBBBBBBB" as WorkspaceReference;
		const html = renderToStaticMarkup(
			<WorkspaceLocationProvider
				itemsById={new Map([[documentItem.id, documentItem]])}
				reveal={() => true}
			>
				<AiChatMessageResponse
					workspaceCitationLocations={
						new Map([
							[
								ref,
								{
									itemId: documentItem.id,
									kind: "item",
									version: 1,
								},
							],
						])
					}
				>
					{`Claim <citation ref="${ref}"></citation>`}
				</AiChatMessageResponse>
			</WorkspaceLocationProvider>,
		);

		expect(html).toContain("<svg");
		expect(html).toContain("text-sky-600");
		expect(html).toContain("Research Notes");
	});

	it("does not expose an incomplete streamed citation tag", () => {
		const html = renderToStaticMarkup(
			<WorkspaceLocationProvider itemsById={new Map()} reveal={() => false}>
				<AiChatMessageResponse isStreaming={true}>
					{'Claim <citation ref="wr_AAAAAAAA'}
				</AiChatMessageResponse>
			</WorkspaceLocationProvider>,
		);

		expect(html).toContain("Claim");
		expect(html).not.toContain("citation");
		expect(html).not.toContain("wr_AAAAAAAA");
	});

	it("renders non-empty citation markup as inert text", () => {
		const ref = "wr_AAAAAAAA" as WorkspaceReference;
		const html = renderToStaticMarkup(
			<WorkspaceLocationProvider itemsById={new Map()} reveal={() => false}>
				<AiChatMessageResponse
					workspaceCitationLocations={
						new Map([
							[
								ref,
								{
									itemId: "document-1",
									kind: "item",
									version: 1,
								},
							],
						])
					}
				>
					{`Claim <citation ref="${ref}">not a citation</citation>`}
				</AiChatMessageResponse>
			</WorkspaceLocationProvider>,
		);

		expect(html).toContain("not a citation");
		expect(html).not.toContain("<button");
	});
});
