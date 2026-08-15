/**
 * Chat citations are self-describing workspace addresses: the assistant copies
 * `refKey` or `refKey/unit` from a read into `<citation ref="…">`, and the
 * client resolves them against the live workspace when a message is drawn.
 * Nothing is minted or persisted per turn.
 */

/** Hidden data part written by earlier versions; recognized only to keep it hidden. */
export const WORKSPACE_REFERENCES_DATA_PART_TYPE = "data-workspace-references";

const anyCompleteWorkspaceCitationTagPattern = /<\/?citation\b[^>]*>/gi;

/**
 * Removes model-only citation markers from text copied to the clipboard.
 *
 * @param text - Assistant Markdown containing zero or more citation tags.
 * @returns Markdown without citation protocol markup.
 */
export function stripWorkspaceCitationTags(text: string) {
	return text.replace(anyCompleteWorkspaceCitationTagPattern, "");
}
