import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import AppErrorScreen from "./components/AppErrorScreen";
import AppNotFoundScreen from "./components/AppNotFoundScreen";
import { capturePostHogClientException } from "./integrations/posthog/provider";
import { getContext } from "./integrations/tanstack-query/root-provider";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
	const context = getContext();

	const router = createTanStackRouter({
		routeTree,
		context,
		scrollRestoration: true,
		defaultPreload: "intent",
		defaultPreloadStaleTime: 0,
		defaultErrorComponent: AppErrorScreen,
		defaultOnCatch: (error, errorInfo) => {
			capturePostHogClientException(error, {
				component_stack: errorInfo.componentStack,
				error_boundary: "TanStackRouter",
			});
		},
		defaultNotFoundComponent: AppNotFoundScreen,
	});

	setupRouterSsrQueryIntegration({ router, queryClient: context.queryClient });

	return router;
}

declare module "@tanstack/react-router" {
	interface Register {
		router: ReturnType<typeof getRouter>;
	}
}
