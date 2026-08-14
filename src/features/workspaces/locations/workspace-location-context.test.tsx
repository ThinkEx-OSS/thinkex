// @vitest-environment jsdom

import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import type { WorkspaceItem } from "#/features/workspaces/contracts";
import {
	useWorkspaceLocationActions,
	useWorkspacePdfPageRevealRequest,
	WorkspaceLocationProvider,
} from "#/features/workspaces/locations/workspace-location-context";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("WorkspaceLocationProvider", () => {
	const containers: HTMLDivElement[] = [];

	afterEach(() => {
		for (const container of containers.splice(0)) container.remove();
	});

	it("consumes the same reveal request object that the provider stored", async () => {
		const item = {
			id: "file-1",
			workspaceId: "workspace-1",
			parentId: null,
			type: "file",
			name: "Book.pdf",
			color: null,
			metadataJson: {},
			sortOrder: 1,
			createdAt: "2026-08-13T00:00:00.000Z",
			updatedAt: "2026-08-13T00:00:00.000Z",
		} satisfies WorkspaceItem;
		let actions: ReturnType<typeof useWorkspaceLocationActions> | undefined;
		let pageRequest: ReturnType<typeof useWorkspacePdfPageRevealRequest> | undefined;
		function Probe() {
			const nextActions = useWorkspaceLocationActions();
			const nextPageRequest = useWorkspacePdfPageRevealRequest("view-1");
			useEffect(() => {
				actions = nextActions;
				pageRequest = nextPageRequest;
			}, [nextActions, nextPageRequest]);
			return null;
		}

		const container = document.body.appendChild(document.createElement("div"));
		containers.push(container);
		const root = createRoot(container);
		await act(async () =>
			root.render(
				<WorkspaceLocationProvider itemsById={new Map([[item.id, item]])} navigate={() => "view-1"}>
					<Probe />
				</WorkspaceLocationProvider>,
			),
		);

		act(() => {
			actions?.reveal({ itemId: item.id, kind: "pdf-page", pageNumber: 4, version: 1 });
		});
		const request = pageRequest?.request;
		expect(request?.location.pageNumber).toBe(4);

		act(() => {
			if (request) pageRequest?.consume(request);
		});
		expect(pageRequest?.request).toBeNull();

		await act(async () => root.unmount());
	});
});
