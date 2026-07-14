import { Component, type ErrorInfo, type ReactNode } from "react";

import { Button } from "#/components/ui/button";
import { capturePostHogClientException } from "#/integrations/posthog/provider";

interface WorkspaceFileViewerErrorBoundaryProps {
	fileName: string;
	children: ReactNode;
}

interface WorkspaceFileViewerErrorBoundaryState {
	error: Error | null;
}

/**
 * Contains file-viewer failures to the viewer pane instead of letting them bubble to the
 * root error boundary and take the whole workspace page down. This is the safety net for a
 * WorkspaceKernel Durable Object reset dropping a content request mid-flight.
 */
export default class WorkspaceFileViewerErrorBoundary extends Component<
	WorkspaceFileViewerErrorBoundaryProps,
	WorkspaceFileViewerErrorBoundaryState
> {
	state: WorkspaceFileViewerErrorBoundaryState = {
		error: null,
	};

	static getDerivedStateFromError(error: Error) {
		return { error };
	}

	componentDidCatch(error: Error, errorInfo: ErrorInfo) {
		console.error("Workspace file viewer failed", error, errorInfo);
		capturePostHogClientException(error, {
			component_stack: errorInfo.componentStack,
			error_boundary: "WorkspaceFileViewerErrorBoundary",
		});
	}

	render() {
		const { error } = this.state;

		if (!error) {
			return this.props.children;
		}

		return (
			<div className="flex h-full min-h-0 flex-col items-center justify-center gap-3 bg-background px-4 text-center">
				<div className="space-y-1">
					<h2 className="font-medium text-foreground text-sm">Unable to load this file</h2>
					<p className="text-muted-foreground text-xs">
						Something went wrong while opening “{this.props.fileName}”. Try again in a moment.
					</p>
				</div>
				<Button variant="outline" size="sm" onClick={() => this.setState({ error: null })}>
					Retry
				</Button>
			</div>
		);
	}
}
