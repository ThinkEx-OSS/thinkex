/** Fisher–Yates, in place. Pass a seeded `random` for deterministic tests. */
export function shuffleInPlace<T>(values: T[], random: () => number = Math.random) {
	for (let index = values.length - 1; index > 0; index -= 1) {
		const swapIndex = Math.floor(random() * (index + 1));
		const value = values[index]!;
		values[index] = values[swapIndex]!;
		values[swapIndex] = value;
	}
	return values;
}
