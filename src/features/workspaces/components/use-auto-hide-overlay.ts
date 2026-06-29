import { type FocusEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

export type AutoHideControls = {
	show: () => void;
	scheduleHide: () => void;
	pin: () => void;
	unpin: () => void;
};

export function useAutoHideControls(delayMs: number): {
	controls: AutoHideControls;
	interactionHandlers: {
		onBlurCapture: (event: FocusEvent<HTMLElement>) => void;
		onFocusCapture: () => void;
		onMouseEnter: () => void;
		onMouseLeave: () => void;
	};
	isVisible: boolean;
} {
	const [isVisible, setIsVisible] = useState(true);
	const isPinnedRef = useRef(false);
	const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const show = useCallback(() => {
		setIsVisible(true);

		if (hideTimeoutRef.current) {
			clearTimeout(hideTimeoutRef.current);
			hideTimeoutRef.current = null;
		}
	}, []);

	const scheduleHide = useCallback(() => {
		if (hideTimeoutRef.current) {
			clearTimeout(hideTimeoutRef.current);
		}

		hideTimeoutRef.current = setTimeout(() => {
			if (!isPinnedRef.current) {
				setIsVisible(false);
			}
		}, delayMs);
	}, [delayMs]);

	const pin = useCallback(() => {
		isPinnedRef.current = true;
		show();
	}, [show]);

	const unpin = useCallback(() => {
		isPinnedRef.current = false;
		scheduleHide();
	}, [scheduleHide]);

	const controls = useMemo(
		(): AutoHideControls => ({
			show,
			scheduleHide,
			pin,
			unpin,
		}),
		[pin, scheduleHide, show, unpin],
	);

	useEffect(
		() => () => {
			if (hideTimeoutRef.current) {
				clearTimeout(hideTimeoutRef.current);
			}
		},
		[],
	);

	return {
		controls,
		isVisible,
		interactionHandlers: {
			onBlurCapture: (event) => {
				if (event.currentTarget.contains(event.relatedTarget)) {
					return;
				}

				unpin();
			},
			onFocusCapture: () => {
				pin();
			},
			onMouseEnter: () => {
				pin();
			},
			onMouseLeave: () => {
				unpin();
			},
		},
	};
}
