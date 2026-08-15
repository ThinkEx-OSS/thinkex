import { z } from "zod";

import {
	getWorkspaceItemContentKind,
	getWorkspaceItemRegistryEntry,
	isWorkspaceItemContainer,
	workspaceItemTypeSchema,
	type WorkspaceItemType,
} from "#/features/workspaces/workspace-item-registry";

// The registry is reached through here, not imported directly, so item-type
// facts arrive from the same module as the schemas that carry them.
export {
	getWorkspaceItemContentKind,
	getWorkspaceItemRegistryEntry,
	isWorkspaceItemContainer,
	workspaceItemTypeSchema,
};
export type { WorkspaceItemType };

export const WORKSPACE_ITEM_NAME_MAX_LENGTH = 160;

export type JsonValue =
	| string
	| number
	| boolean
	| null
	| JsonValue[]
	| { [key: string]: JsonValue };

export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
	z.union([
		z.string(),
		z.number(),
		z.boolean(),
		z.null(),
		z.array(jsonValueSchema),
		z.record(z.string(), jsonValueSchema),
	]),
);

export const workspaceIconValues = [
	"book-marked",
	"book-open",
	"book-open-text",
	"book-search",
	"graduation-cap",
	"library-big",
	"school",
	"notebook-pen",
	"notebook-tabs",
	"highlighter",
	"file-text",
	"file-chart-column",
	"folder-open",
	"folder-search",
	"archive",
	"clipboard-list",
	"kanban",
	"list-todo",
	"presentation",
	"calendar-days",
	"clock-3",
	"target",
	"lightbulb",
	"brain",
	"brain-circuit",
	"compass",
	"map",
	"globe-2",
	"languages",
	"scroll-text",
	"newspaper",
	"palette",
	"swatch-book",
	"pen-tool",
	"pencil-ruler",
	"music",
	"audio-lines",
	"mic",
	"headphones",
	"camera",
	"video",
	"theater",
	"scale",
	"gavel",
	"vote",
	"landmark",
	"message-square-text",
	"users",
	"helping-hand",
	"handshake",
	"hand-coins",
	"briefcase-business",
	"building-2",
	"chart-column",
	"chart-line",
	"chart-scatter",
	"chart-gantt",
	"chart-pie",
	"banknote",
	"piggy-bank",
	"receipt-text",
	"megaphone",
	"wallet-cards",
	"store",
	"factory",
	"truck",
	"package",
	"shield-check",
	"search-check",
	"atom",
	"orbit",
	"magnet",
	"flask-conical",
	"test-tube-diagonal",
	"microscope",
	"activity",
	"dna",
	"sigma",
	"calculator",
	"ruler",
	"drafting-compass",
	"cpu",
	"circuit-board",
	"binary",
	"database",
	"bot",
	"code-2",
	"wrench",
	"stethoscope",
	"hospital",
	"heart-pulse",
	"pill",
	"pill-bottle",
	"leaf",
	"sprout",
	"earth",
	"waves",
	"droplet",
	"thermometer",
	"flame",
	"mountain",
	"cloud-sun",
	"telescope",
	"rocket",
	"satellite",
	"zap",
] as const;

export const workspaceIconSchema = z.enum(workspaceIconValues);

export const workspaceColorValues = [
	"yellow-soft",
	"yellow",
	"yellow-bold",
	"yellow-deep",
	"green-soft",
	"green",
	"green-bold",
	"green-deep",
	"cyan-soft",
	"cyan",
	"cyan-bold",
	"cyan-deep",
	"blue-soft",
	"blue",
	"blue-bold",
	"blue-deep",
	"indigo-soft",
	"indigo",
	"indigo-bold",
	"indigo-deep",
	"stone-soft",
	"stone",
	"stone-bold",
	"stone-deep",
	"red-soft",
	"red",
	"red-bold",
	"red-deep",
	"orange-soft",
	"orange",
	"orange-bold",
	"orange-deep",
	"amber-soft",
	"amber",
	"amber-bold",
	"amber-deep",
	"emerald-soft",
	"emerald",
	"emerald-bold",
	"emerald-deep",
	"teal-soft",
	"teal",
	"teal-bold",
	"teal-deep",
	"sky-soft",
	"sky",
	"sky-bold",
	"sky-deep",
	"violet-soft",
	"violet",
	"violet-bold",
	"violet-deep",
	"rose-soft",
	"rose",
	"rose-bold",
	"rose-deep",
] as const;

export const workspaceColorSchema = z.enum(workspaceColorValues);

export const workspaceThemeValues = [
	"study-session",
	"lecture-notes",
	"exam-prep",
	"coursework",
	"reading-list",
	"library",
	"seminar",
	"study-group",
	"graduation",
	"highlights",
	"research-project",
	"literature-review",
	"thesis",
	"citations",
	"fieldwork",
	"lab-work",
	"data-analysis",
	"grant-proposal",
	"knowledge-base",
	"notes",
	"archive",
	"ideas",
	"reference",
	"chemistry",
	"biology",
	"physics",
	"astronomy",
	"molecular-science",
	"genetics",
	"neuroscience",
	"mathematics",
	"geometry",
	"statistics",
	"earth-science",
	"climate",
	"space",
	"electronics",
	"medicine",
	"anatomy",
	"pharmacy",
	"clinical",
	"history",
	"archaeology",
	"geography",
	"world-studies",
	"languages",
	"literature",
	"creative-writing",
	"journalism",
	"philosophy",
	"law",
	"politics",
	"psychology",
	"discussion",
	"design",
	"drawing",
	"painting",
	"photography",
	"film",
	"theatre",
	"music",
	"instrument-practice",
	"podcasting",
	"audio",
	"programming",
	"web-development",
	"data-science",
	"ai",
	"hardware",
	"robotics",
	"cybersecurity",
	"engineering",
	"systems",
	"business",
	"strategy",
	"meetings",
	"analytics",
	"reporting",
	"finance",
	"accounting",
	"marketing",
	"sales",
	"operations",
	"logistics",
	"product",
	"project-plan",
	"startup",
	"clients",
	"people",
	"legal-research",
	"real-estate",
	"planner",
	"to-do",
	"job-search",
	"money",
	"savings",
	"expenses",
	"home-diy",
	"gardening",
	"travel",
	"wellbeing",
	"economics",
	"sociology",
	"anthropology",
	"criminology",
	"linguistics",
	"classics",
	"art-history",
	"media-studies",
	"ecology",
	"environmental-science",
	"architecture",
	"nursing",
	"public-health",
	"teaching",
	"social-work",
	"default",
] as const;

export const workspaceThemeSchema = z.enum(workspaceThemeValues);
export type WorkspaceTheme = z.infer<typeof workspaceThemeSchema>;

export const workspaceRoles = ["owner", "admin", "editor", "viewer"] as const;

export const workspaceMembershipRoleSchema = z.enum(workspaceRoles);

export const workspaceRelationKindValues = ["derived_from", "references"] as const;

export const workspaceRelationKindSchema = z.enum(workspaceRelationKindValues);

export type WorkspaceRelationKind = (typeof workspaceRelationKindValues)[number];

export const workspaceSummarySchema = z.object({
	id: z.string(),
	name: z.string(),
	description: z.string().nullable(),
	icon: workspaceIconSchema.nullable(),
	color: workspaceColorSchema.nullable(),
	theme: workspaceThemeSchema.nullable(),
	createdAt: z.string(),
	updatedAt: z.string(),
	lastOpenedAt: z.string().nullable(),
	archivedAt: z.string().nullable(),
	membershipRole: workspaceMembershipRoleSchema,
});

export const workspaceItemSchema = z.object({
	id: z.string(),
	workspaceId: z.string(),
	parentId: z.string().nullable(),
	type: workspaceItemTypeSchema,
	name: z.string(),
	refKey: z.string(),
	color: z.string().nullable(),
	metadataJson: z.record(z.string(), jsonValueSchema),
	sortOrder: z.number(),
	createdAt: z.string(),
	updatedAt: z.string(),
});

export const createWorkspaceItemInputSchema = z
	.object({
		id: z.uuid(),
		workspaceId: z.string().min(1),
		parentId: z.string().min(1).nullable().optional(),
		type: z.enum(["document", "folder"]),
		name: z.string().trim().min(1).max(WORKSPACE_ITEM_NAME_MAX_LENGTH).optional(),
		color: workspaceColorSchema.optional(),
		initialContent: z.string().optional(),
	})
	.superRefine((input, context) => {
		if (input.initialContent !== undefined && input.type !== "document") {
			context.addIssue({
				code: "custom",
				message: "Initial content can only be provided for documents.",
				path: ["initialContent"],
			});
		}
	});

export const renameWorkspaceItemInputSchema = z.object({
	workspaceId: z.string().min(1),
	itemId: z.string().min(1),
	name: z.string().trim().min(1).max(WORKSPACE_ITEM_NAME_MAX_LENGTH),
});

const moveWorkspaceItemOperationSchema = z.object({
	itemId: z.string().min(1),
	sortOrder: z.number().int().optional(),
});

export const moveWorkspaceItemsInputSchema = z.object({
	workspaceId: z.string().min(1),
	items: z.array(moveWorkspaceItemOperationSchema).min(1),
	parentId: z.string().min(1).nullable().optional(),
});

export const deleteWorkspaceItemsInputSchema = z.object({
	workspaceId: z.string().min(1),
	itemIds: z.array(z.string().min(1)).min(1),
});

export const updateWorkspaceItemColorInputSchema = z.object({
	workspaceId: z.string().min(1),
	itemId: z.string().min(1),
	color: workspaceColorSchema,
});

export const createWorkspaceInputSchema = z.object({
	id: z.uuid().optional(),
	name: z.string().trim().min(1).max(120).optional(),
	color: workspaceColorSchema.nullable().optional(),
});

export const updateWorkspaceInputSchema = z.object({
	workspaceId: z.string().min(1),
	name: z.string().trim().min(1).max(120),
	icon: workspaceIconSchema,
	color: workspaceColorSchema,
	theme: workspaceThemeSchema.nullable(),
});

export const deleteWorkspaceInputSchema = z.object({
	workspaceId: z.string().min(1),
	confirmationName: z.string().trim().min(1),
});

export const workspaceRoleLabels: Record<(typeof workspaceRoles)[number], string> = {
	owner: "Owner",
	admin: "Admin",
	editor: "Editor",
	viewer: "Viewer",
};

export const workspaceIdInputSchema = z.object({
	workspaceId: z.string().min(1),
});

export const workspacePageSchema = z.object({
	workspace: workspaceSummarySchema,
	items: z.array(workspaceItemSchema),
	revision: z.number().int().nonnegative(),
});

export type WorkspaceIcon = z.infer<typeof workspaceIconSchema>;
export type WorkspaceColor = z.infer<typeof workspaceColorSchema>;
export type WorkspaceSummary = z.infer<typeof workspaceSummarySchema>;
export type WorkspaceItem = z.infer<typeof workspaceItemSchema>;
export type CreateWorkspaceItemInput = z.infer<typeof createWorkspaceItemInputSchema>;
export type RenameWorkspaceItemInput = z.infer<typeof renameWorkspaceItemInputSchema>;
export type MoveWorkspaceItemsInput = z.infer<typeof moveWorkspaceItemsInputSchema>;
export type DeleteWorkspaceItemsInput = z.infer<typeof deleteWorkspaceItemsInputSchema>;
export type UpdateWorkspaceItemColorInput = z.infer<typeof updateWorkspaceItemColorInputSchema>;
export type CreateWorkspaceInput = z.infer<typeof createWorkspaceInputSchema>;
export type UpdateWorkspaceInput = z.infer<typeof updateWorkspaceInputSchema>;
export type DeleteWorkspaceInput = z.infer<typeof deleteWorkspaceInputSchema>;
export type WorkspaceMembershipRole = z.infer<typeof workspaceMembershipRoleSchema>;

export const workspaceMemberSummarySchema = z.object({
	userId: z.string().min(1),
	name: z.string().min(1),
	image: z.string().nullable(),
	role: workspaceMembershipRoleSchema,
});

export type WorkspaceMemberSummary = z.infer<typeof workspaceMemberSummarySchema>;

export const workspaceEmailInviteSummarySchema = z.object({
	id: z.string().min(1),
	email: z.email(),
	role: workspaceMembershipRoleSchema,
	createdAt: z.coerce.date(),
});

export type WorkspaceEmailInviteSummary = z.infer<typeof workspaceEmailInviteSummarySchema>;

export type WorkspacePage = z.infer<typeof workspacePageSchema>;
