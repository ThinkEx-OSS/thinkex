import { customAlphabet } from "nanoid";
import { z } from "zod";

import type { WorkspaceItemType } from "#/features/workspaces/contracts";

const WORKSPACE_REFERENCE_ALPHABET =
	"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
/** Mints the short, durable, model-facing handle a workspace item keeps for life. */
export const createWorkspaceItemRefKey = customAlphabet(WORKSPACE_REFERENCE_ALPHABET, 8);
const workspaceLocationItemIdSchema = z.string().trim().min(1);

const createWorkspaceEntryIdSuffix = customAlphabet(WORKSPACE_REFERENCE_ALPHABET, 8);

/** Mints the id of one card or question, e.g. `c_9xKp2Qab`. */
export function createWorkspaceEntryId(prefix: "c" | "q") {
	return `${prefix}_${createWorkspaceEntryIdSuffix()}`;
}

/**
 * One flashcard or quiz-question id. Early content minted UUIDs; everything
 * since mints the short prefixed form, and both stay valid ids forever.
 */
export const workspaceEntryIdSchema = z.union([
	z.string().regex(/^[cq]_[0-9A-Za-z]{8}$/),
	z.uuid(),
]);

/**
 * Durable, versioned pointer to content inside a workspace, as persisted by
 * document and chat citations. Model-facing addresses parse into this against
 * the item they name.
 */
export const workspaceLocationSchema = z.discriminatedUnion("kind", [
	z.strictObject({
		itemId: workspaceLocationItemIdSchema,
		kind: z.literal("item"),
		version: z.literal(1),
	}),
	z.strictObject({
		itemId: workspaceLocationItemIdSchema,
		kind: z.literal("pdf-page"),
		pageNumber: z.number().int().positive(),
		version: z.literal(1),
	}),
	z.strictObject({
		itemId: workspaceLocationItemIdSchema,
		kind: z.literal("document-block"),
		blockId: z.string().regex(/^b_[A-Za-z0-9_-]{12}$/),
		version: z.literal(1),
	}),
	z.strictObject({
		itemId: workspaceLocationItemIdSchema,
		kind: z.literal("flashcard"),
		cardId: workspaceEntryIdSchema,
		version: z.literal(1),
	}),
	z.strictObject({
		itemId: workspaceLocationItemIdSchema,
		kind: z.literal("quiz-question"),
		questionId: workspaceEntryIdSchema,
		version: z.literal(1),
	}),
]);

/** A parsed durable workspace location. */
export type WorkspaceLocation = Readonly<z.output<typeof workspaceLocationSchema>>;

/**
 * The model-facing address grammar: `refKey[/unit][.r_revision]`.
 *
 * `refKey` is the item's durable 8-character handle. `unit` names one piece of
 * it — `p5` a physical page, `b_…` a document block, a card or question id for
 * study items — and is interpreted against the item's type, so the token never
 * has to encode what kind of thing it names. `.r_…` carries the 6-character
 * content revision an edit must present. The whole string is self-describing:
 * nothing has to be minted, stored, or kept alive server-side for it to
 * resolve, so an address from any point in a conversation keeps working.
 */
const workspaceAddressPattern =
	/^([0-9A-Za-z]{8})(?:\/([A-Za-z0-9_-]{1,40}?))?(?:\.r_([A-Za-z0-9_-]{6}))?$/;

export const workspaceAddressInputSchema = z.string().regex(workspaceAddressPattern);

export interface WorkspaceAddress {
	refKey: string;
	unit?: string;
	revision?: string;
}

export function parseWorkspaceAddress(input: unknown): WorkspaceAddress | undefined {
	if (typeof input !== "string") return undefined;
	const match = workspaceAddressPattern.exec(input.trim());
	if (!match) return undefined;
	return {
		refKey: match[1]!,
		...(match[2] ? { unit: match[2] } : {}),
		...(match[3] ? { revision: match[3] } : {}),
	};
}

/**
 * Interprets an address's unit against the item it names.
 *
 * @returns The durable location, or undefined when the unit cannot belong to
 * an item of this type.
 */
export function resolveWorkspaceAddressLocation(
	item: { id: string; type: WorkspaceItemType },
	address: WorkspaceAddress,
): WorkspaceLocation | undefined {
	if (address.unit === undefined) {
		return { itemId: item.id, kind: "item", version: 1 };
	}
	if (item.type === "file") {
		const page = /^p([1-9]\d{0,5})$/.exec(address.unit);
		return page
			? { itemId: item.id, kind: "pdf-page", pageNumber: Number(page[1]), version: 1 }
			: undefined;
	}
	if (item.type === "document") {
		return /^b_[A-Za-z0-9_-]{12}$/.test(address.unit)
			? { blockId: address.unit, itemId: item.id, kind: "document-block", version: 1 }
			: undefined;
	}
	if (item.type === "flashcard") {
		const cardId = workspaceEntryIdSchema.safeParse(address.unit);
		return cardId.success
			? { cardId: cardId.data, itemId: item.id, kind: "flashcard", version: 1 }
			: undefined;
	}
	if (item.type === "quiz") {
		const questionId = workspaceEntryIdSchema.safeParse(address.unit);
		return questionId.success
			? { itemId: item.id, kind: "quiz-question", questionId: questionId.data, version: 1 }
			: undefined;
	}
	return undefined;
}

/**
 * A unit ref as copied from a read into an edit: `unit.r_revision`. The item
 * is already named by the edit call's path, so the ref stays item-relative.
 */
const workspaceUnitRefPattern = /^([A-Za-z0-9_-]{1,40}?)\.r_([A-Za-z0-9_-]{6})$/;

export const workspaceUnitRefInputSchema = z.string().regex(workspaceUnitRefPattern);

export function parseWorkspaceUnitRef(
	input: string,
): { unit: string; revision: string } | undefined {
	const match = workspaceUnitRefPattern.exec(input);
	return match ? { unit: match[1]!, revision: match[2]! } : undefined;
}
