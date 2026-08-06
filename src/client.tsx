import { StartClient } from "@tanstack/react-start/client";
import { StrictMode, startTransition } from "react";
import { hydrateRoot } from "react-dom/client";

import ClientErrorBoundary from "#/components/ClientErrorBoundary";
import { capturePostHogClientException } from "#/integrations/posthog/provider";

startTransition(() => {
	hydrateRoot(
		document,
		<StrictMode>
			<ClientErrorBoundary>
				<StartClient />
			</ClientErrorBoundary>
		</StrictMode>,
		{
			onRecoverableError: (error, errorInfo) => {
				capturePostHogClientException(error, {
					component_stack: errorInfo.componentStack,
					error_boundary: "hydrateRoot",
				});
			},
		},
	);
});
