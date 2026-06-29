import { StartClient } from "@tanstack/react-start/client";
import { StrictMode, startTransition } from "react";
import { hydrateRoot } from "react-dom/client";

import ClientErrorBoundary from "#/components/ClientErrorBoundary";

startTransition(() => {
	hydrateRoot(
		document,
		<StrictMode>
			<ClientErrorBoundary>
				<StartClient />
			</ClientErrorBoundary>
		</StrictMode>,
	);
});
