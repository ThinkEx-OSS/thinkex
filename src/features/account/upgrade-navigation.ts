/**
 * What sent the user here, for the entry points where nothing else on screen
 * says. Values are Autumn feature ids so callers can pass a tier straight
 * through without a second mapping.
 */
export type UpgradeReason = "standard_messages" | "premium_messages" | "file_uploads";

export const UPGRADE_REASONS = [
	"standard_messages",
	"premium_messages",
	"file_uploads",
] as const satisfies readonly UpgradeReason[];

export const UPGRADE_REASON_LABELS: Record<UpgradeReason, string> = {
	standard_messages: "standard messages",
	premium_messages: "premium messages",
	file_uploads: "file uploads",
};

export function showUpgradeDialog<T extends object>(search: T) {
	return { ...search, settings: undefined, upgrade: true as const };
}

/**
 * For entry points that stop someone mid-action rather than being browsed to.
 * Curried because the router takes the updater itself as `search`.
 *
 * Only worth passing where the surface hasn't already said what ran out: the
 * allowance notice and the file limit dialog announce their own, and repeating
 * it in the dialog they open would be the same sentence twice.
 */
export function showUpgradeDialogFor(reason: UpgradeReason) {
	return <T extends object>(search: T) => ({ ...search, settings: undefined, upgrade: reason });
}
