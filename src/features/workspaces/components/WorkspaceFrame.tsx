import type { ReactNode } from "react";

interface WorkspaceFrameProps {
	chrome: ReactNode;
	content: ReactNode;
}

export default function WorkspaceFrame({ chrome, content }: WorkspaceFrameProps) {
	return (
		<div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
			{chrome}
			<main className="min-h-0 flex-1 bg-background">{content}</main>
		</div>
	);
}
