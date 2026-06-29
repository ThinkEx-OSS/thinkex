import { useViewportCapability } from "@embedpdf/plugin-viewport/react";
import { useEffect } from "react";

import type { AutoHideControls } from "#/features/workspaces/components/use-auto-hide-overlay";

export function usePdfViewportAutoHide(
	documentId: string,
	enabled: boolean,
	controls: AutoHideControls,
) {
	const { provides: viewportCapability } = useViewportCapability();

	useEffect(() => {
		if (!enabled) {
			return;
		}

		controls.scheduleHide();

		const viewport = viewportCapability?.forDocument(documentId);

		if (!viewport) {
			return;
		}

		const unsubscribeScroll = viewport.onScrollChange(controls.show);

		const unsubscribeActivity = viewport.onScrollActivity((activity) => {
			if (activity.isScrolling || activity.isSmoothScrolling) {
				controls.show();
				return;
			}

			controls.scheduleHide();
		});

		return () => {
			unsubscribeScroll();
			unsubscribeActivity();
		};
	}, [controls, documentId, enabled, viewportCapability]);
}
