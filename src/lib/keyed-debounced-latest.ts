import { debounce } from "@tanstack/pacer";

export function createKeyedDebouncedLatest<TInput>({
	getKey,
	onExecute,
	wait,
}: {
	getKey: (input: TInput) => string;
	onExecute: (input: TInput) => void;
	wait: number;
}) {
	const debouncedByKey = new Map<string, (input: TInput) => void>();

	return (input: TInput) => {
		const key = getKey(input);
		let debounced = debouncedByKey.get(key);

		if (!debounced) {
			debounced = debounce(
				(latestInput: TInput) => {
					debouncedByKey.delete(key);
					onExecute(latestInput);
				},
				{ wait },
			);
			debouncedByKey.set(key, debounced);
		}

		debounced(input);
	};
}
