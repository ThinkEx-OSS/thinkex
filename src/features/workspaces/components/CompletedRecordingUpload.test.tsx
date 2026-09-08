import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CompletedRecordingUpload } from "#/features/workspaces/components/CompletedRecordingUpload";
import { workspaceRecordingMaxBytes } from "#/features/workspaces/recordings/workspace-recording";

describe("completed recording recovery", () => {
	it("offers download and removal, but no impossible upload retry for oversized audio", () => {
		const megabyte = new Blob([new Uint8Array(1024 * 1024)]);
		const blob = new Blob([...Array.from({ length: 96 }, () => megabyte), "tail"]);
		expect(blob.size).toBeGreaterThan(workspaceRecordingMaxBytes);
		const html = renderToStaticMarkup(
			<CompletedRecordingUpload
				blob={blob}
				name="Lecture"
				busy={false}
				onRetry={() => {}}
				onDiscard={() => {}}
			/>,
		);
		expect(html).toContain("Download audio");
		expect(html).toContain("Remove local copy");
		expect(html).not.toContain("Retry upload");
	});
});
