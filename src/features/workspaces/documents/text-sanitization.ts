// Tab (0x09), line feed (0x0A), and carriage return (0x0D) carry document
// structure, so they survive. The rest of the C0 control range and the lone
// DEL (0x7F) are noise that UTF-16 text and Excel "Unicode Text" exports leak
// into otherwise-plain files. U+0000 is the dangerous one: Postgres rejects it
// inside a jsonb value (SQLSTATE 22P05) and inside any text column, so it must
// never reach a persistence write.
function isStrippableControlCharacter(codePoint: number): boolean {
	if (codePoint === 0x09 || codePoint === 0x0a || codePoint === 0x0d) {
		return false;
	}

	return codePoint <= 0x1f || codePoint === 0x7f;
}

/** Remove control characters that no document needs and that break persistence. */
export function stripControlCharacters(text: string): string {
	let result = "";

	for (const character of text) {
		if (!isStrippableControlCharacter(character.codePointAt(0) ?? 0)) {
			result += character;
		}
	}

	return result;
}
