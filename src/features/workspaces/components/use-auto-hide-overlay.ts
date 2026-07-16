import { type FocusEvent, useEffect, useRef, useState } from "react";

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

	const show = () => {
		setIsVisible(true);

		if (hideTimeoutRef.current) {
			clearTimeout(hideTimeoutRef.current);
			hideTimeoutRef.current = null;
		}
	};

	const scheduleHide = () => {
		if (hideTimeoutRef.current) {
			clearTimeout(hideTimeoutRef.current);
		}

		hideTimeoutRef.current = setTimeout(() => {
			if (!isPinnedRef.current) {
				setIsVisible(false);
			}
		}, delayMs);
	};

	const pin = () => {
		isPinnedRef.current = true;
		show();
	};

	const unpin = () => {
		isPinnedRef.current = false;
		scheduleHide();
	};

	const controls: AutoHideControls = {
		show,
		scheduleHide,
		pin,
		unpin,
	};

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
