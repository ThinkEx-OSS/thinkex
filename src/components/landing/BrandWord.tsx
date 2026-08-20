const LETTER_COLORS = ["text-brand-1", "text-brand-2", "text-brand-3", "text-brand-4"] as const;

/**
 * Paints a word one logo color per letter, cycling if it runs longer than the
 * palette.
 */
export function BrandWord({ word }: { word: string }) {
	return (
		// The letters are separate elements, so the word is wrapped as one unit to
		// keep it from breaking mid-word at a narrow width.
		<span className="whitespace-nowrap">
			{word.split("").map((letter, index) => (
				// Fixed string, so index is stable and there is no better key.
				// biome-ignore lint/suspicious/noArrayIndexKey: letters have no id
				<span key={index} className={LETTER_COLORS[index % LETTER_COLORS.length]}>
					{letter}
				</span>
			))}
		</span>
	);
}
