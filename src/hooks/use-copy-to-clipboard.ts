import { useCallback, useEffect, useRef, useState } from "react";

interface UseCopyToClipboardOptions {
	resetTimeoutMs?: number;
	onCopy?: () => void;
	onError?: (error: Error) => void;
}

export function useCopyToClipboard({
	resetTimeoutMs = 1000,
	onCopy,
	onError,
}: UseCopyToClipboardOptions = {}) {
	const [copied, setCopied] = useState(false);
	const timeoutRef = useRef<number | null>(null);

	useEffect(
		() => () => {
			if (timeoutRef.current !== null) {
				window.clearTimeout(timeoutRef.current);
			}
		},
		[],
	);

	const copy = useCallback(
		async (text: string) => {
			if (typeof window === "undefined" || !navigator?.clipboard?.writeText) {
				onError?.(new Error("Clipboard API not available"));
				return false;
			}

			try {
				await navigator.clipboard.writeText(text);
				setCopied(true);
				onCopy?.();

				if (timeoutRef.current !== null) {
					window.clearTimeout(timeoutRef.current);
				}

				timeoutRef.current = window.setTimeout(() => setCopied(false), resetTimeoutMs);

				return true;
			} catch (error) {
				onError?.(error as Error);
				return false;
			}
		},
		[onCopy, onError, resetTimeoutMs],
	);

	return { copied, copy };
}
