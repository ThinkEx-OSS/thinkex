import type { ReactNode } from "react";

export function WorkspaceMaximizedPresentation({ children }: { children: ReactNode }) {
	return (
		<div data-app-shell className="h-screen overflow-hidden bg-background text-foreground">
			{children}
		</div>
	);
}
