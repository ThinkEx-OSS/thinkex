// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import WorkspaceCreateMenu from "./WorkspaceCreateMenu";

vi.mock("./workspace-mutation-access", () => ({
	useWorkspaceMutationAccess: () => ({ capabilities: { canMutateContent: true } }),
}));
vi.mock("./WorkspaceFileIntakeProvider", () => ({ useWorkspaceFileIntake: vi.fn() }));
vi.mock("./WorkspaceRecordingProvider", () => ({ useWorkspaceRecording: vi.fn() }));

it("names the create trigger even with its narrow-pane label hidden", () => {
	const host = document.createElement("div");
	host.innerHTML = renderToStaticMarkup(
		<WorkspaceCreateMenu parentId={null} onCreateItem={() => {}} />,
	);
	const button = host.querySelector('button[aria-label="New"]');
	expect(button).not.toBeNull();
	const label = button?.querySelector("span");
	expect(label?.textContent).toBe("New");
	expect(label?.classList.contains("hidden")).toBe(true);
	expect(label?.classList.contains("@min-[40rem]/context:inline")).toBe(true);
});
