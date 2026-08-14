export type ReplaceUniqueTextFailureCode = "edit_not_found" | "edit_not_unique";

/** Replace one exact occurrence, or explain why the target is unsafe. */
export function replaceUniqueText(
	source: string,
	find: string,
	replace: string,
): { ok: true; text: string } | { ok: false; code: ReplaceUniqueTextFailureCode; detail: string } {
	const haystack = source.replaceAll("\r\n", "\n");
	const needle = find.replaceAll("\r\n", "\n");
	const matches = haystack.split(needle).length - 1;

	if (matches === 0) {
		return { ok: false, code: "edit_not_found", detail: `No match for: ${needle.slice(0, 80)}` };
	}
	if (matches > 1) {
		return {
			ok: false,
			code: "edit_not_unique",
			detail: `Found ${matches} matches; include more surrounding text so it matches once.`,
		};
	}

	return { ok: true, text: haystack.replace(needle, replace) };
}
