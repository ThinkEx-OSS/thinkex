import { Link } from "@tanstack/react-router";

import ErrorFallbackScreen from "#/components/ErrorFallbackScreen";

export default function AppErrorScreen() {
	return (
		<ErrorFallbackScreen
			message="Something went wrong while loading this page."
			showRetry
			homeLink={<Link to="/">Back to home</Link>}
		/>
	);
}
