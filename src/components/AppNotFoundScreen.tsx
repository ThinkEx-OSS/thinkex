import type { NotFoundRouteProps } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";

import ErrorFallbackScreen from "#/components/ErrorFallbackScreen";

function getNotFoundMessage(data: unknown) {
	if (
		typeof data === "object" &&
		data !== null &&
		"resource" in data &&
		data.resource === "workspace"
	) {
		return "This workspace doesn't exist, or you don't have access to it.";
	}

	return "We couldn't find the page you're looking for.";
}

export default function AppNotFoundScreen({ data }: NotFoundRouteProps) {
	return (
		<ErrorFallbackScreen
			eyebrow="Not found"
			title="This page doesn't exist"
			message={getNotFoundMessage(data)}
			homeLink={<Link to="/home">Back to workspaces</Link>}
		/>
	);
}
