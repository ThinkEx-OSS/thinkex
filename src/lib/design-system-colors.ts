/**
 * Runtime color values for inline styles (collaboration cursors, etc.).
 * Generic UI palette — not tied to logo/brand (brand comes later).
 */

export const DEFAULT_COLLABORATION_COLOR = "#2563eb";

/** Presence / collaboration cursor palette */
export const COLLABORATION_USER_COLORS = [
	"#2563eb",
	"#059669",
	"#dc2626",
	"#7c3aed",
	"#ca8a04",
	"#0891b2",
	"#be185d",
	"#4f46e5",
] as const;

export function getCollaborationUserColor(userId: string) {
	let hash = 0;

	for (const char of userId) {
		hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
	}

	return COLLABORATION_USER_COLORS[hash % COLLABORATION_USER_COLORS.length];
}

/** Shared status badge surface pattern */
export const statusBadgeClassName = {
	destructive: "border-destructive/25 bg-destructive/10 text-destructive",
	success: "border-success/25 bg-success/10 text-success",
	warning: "border-warning/25 bg-warning/10 text-warning",
	info: "border-info/25 bg-info/10 text-info",
} as const;
