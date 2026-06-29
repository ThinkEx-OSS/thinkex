/**
 * User-selectable workspace accent palette.
 * These are content primitives for user customization — not app chrome semantics.
 * App UI should use design-tokens.css (--background, --primary, etc.) instead.
 */

import type { WorkspaceColor } from "#/features/workspaces/contracts";

interface WorkspaceColorDefinition {
	value: WorkspaceColor;
	label: string;
	swatchClassName: string;
	checkClassName?: string;
	chromeClassName: string;
	iconClassName: string;
	surfaceClassName: string;
}

export const workspaceColorOptions = [
	{
		value: "red-soft",
		label: "Red soft",
		swatchClassName: "bg-red-300",
		checkClassName: "text-red-950",
		chromeClassName: "bg-red-300/20",
		iconClassName: "text-red-500 dark:text-red-300",
		surfaceClassName: "bg-red-300/10 dark:bg-red-400/20",
	},
	{
		value: "red",
		label: "Red",
		swatchClassName: "bg-red-500",
		chromeClassName: "bg-red-500/20",
		iconClassName: "text-red-600 dark:text-red-400",
		surfaceClassName: "bg-red-500/10 dark:bg-red-500/20",
	},
	{
		value: "red-bold",
		label: "Red bold",
		swatchClassName: "bg-red-600",
		chromeClassName: "bg-red-600/20",
		iconClassName: "text-red-700 dark:text-red-400",
		surfaceClassName: "bg-red-600/10 dark:bg-red-500/20",
	},
	{
		value: "red-deep",
		label: "Red deep",
		swatchClassName: "bg-red-700",
		chromeClassName: "bg-red-700/20",
		iconClassName: "text-red-700 dark:text-red-300",
		surfaceClassName: "bg-red-700/10 dark:bg-red-500/20",
	},
	{
		value: "orange-soft",
		label: "Orange soft",
		swatchClassName: "bg-orange-300",
		checkClassName: "text-orange-950",
		chromeClassName: "bg-orange-300/20",
		iconClassName: "text-orange-500 dark:text-orange-300",
		surfaceClassName: "bg-orange-300/10 dark:bg-orange-400/20",
	},
	{
		value: "orange",
		label: "Orange",
		swatchClassName: "bg-orange-500",
		chromeClassName: "bg-orange-500/20",
		iconClassName: "text-orange-600 dark:text-orange-400",
		surfaceClassName: "bg-orange-500/10 dark:bg-orange-500/20",
	},
	{
		value: "orange-bold",
		label: "Orange bold",
		swatchClassName: "bg-orange-600",
		chromeClassName: "bg-orange-600/20",
		iconClassName: "text-orange-700 dark:text-orange-400",
		surfaceClassName: "bg-orange-600/10 dark:bg-orange-500/20",
	},
	{
		value: "orange-deep",
		label: "Orange deep",
		swatchClassName: "bg-orange-700",
		chromeClassName: "bg-orange-700/20",
		iconClassName: "text-orange-700 dark:text-orange-300",
		surfaceClassName: "bg-orange-700/10 dark:bg-orange-500/20",
	},
	{
		value: "amber-soft",
		label: "Amber soft",
		swatchClassName: "bg-amber-300",
		checkClassName: "text-amber-950",
		chromeClassName: "bg-amber-300/20",
		iconClassName: "text-amber-500 dark:text-amber-300",
		surfaceClassName: "bg-amber-300/10 dark:bg-amber-400/20",
	},
	{
		value: "amber",
		label: "Amber",
		swatchClassName: "bg-amber-500",
		checkClassName: "text-amber-950",
		chromeClassName: "bg-amber-500/20",
		iconClassName: "text-amber-600 dark:text-amber-400",
		surfaceClassName: "bg-amber-500/10 dark:bg-amber-500/20",
	},
	{
		value: "amber-bold",
		label: "Amber bold",
		swatchClassName: "bg-amber-600",
		chromeClassName: "bg-amber-600/20",
		iconClassName: "text-amber-700 dark:text-amber-400",
		surfaceClassName: "bg-amber-600/10 dark:bg-amber-500/20",
	},
	{
		value: "amber-deep",
		label: "Amber deep",
		swatchClassName: "bg-amber-700",
		chromeClassName: "bg-amber-700/20",
		iconClassName: "text-amber-700 dark:text-amber-300",
		surfaceClassName: "bg-amber-700/10 dark:bg-amber-500/20",
	},
	{
		value: "emerald-soft",
		label: "Emerald soft",
		swatchClassName: "bg-emerald-300",
		checkClassName: "text-emerald-950",
		chromeClassName: "bg-emerald-300/20",
		iconClassName: "text-emerald-500 dark:text-emerald-300",
		surfaceClassName: "bg-emerald-300/10 dark:bg-emerald-400/20",
	},
	{
		value: "emerald",
		label: "Emerald",
		swatchClassName: "bg-emerald-500",
		chromeClassName: "bg-emerald-500/20",
		iconClassName: "text-emerald-600 dark:text-emerald-400",
		surfaceClassName: "bg-emerald-500/10 dark:bg-emerald-500/20",
	},
	{
		value: "emerald-bold",
		label: "Emerald bold",
		swatchClassName: "bg-emerald-600",
		chromeClassName: "bg-emerald-600/20",
		iconClassName: "text-emerald-700 dark:text-emerald-400",
		surfaceClassName: "bg-emerald-600/10 dark:bg-emerald-500/20",
	},
	{
		value: "emerald-deep",
		label: "Emerald deep",
		swatchClassName: "bg-emerald-700",
		chromeClassName: "bg-emerald-700/20",
		iconClassName: "text-emerald-700 dark:text-emerald-300",
		surfaceClassName: "bg-emerald-700/10 dark:bg-emerald-500/20",
	},
	{
		value: "teal-soft",
		label: "Teal soft",
		swatchClassName: "bg-teal-300",
		checkClassName: "text-teal-950",
		chromeClassName: "bg-teal-300/20",
		iconClassName: "text-teal-500 dark:text-teal-300",
		surfaceClassName: "bg-teal-300/10 dark:bg-teal-400/20",
	},
	{
		value: "teal",
		label: "Teal",
		swatchClassName: "bg-teal-500",
		chromeClassName: "bg-teal-500/20",
		iconClassName: "text-teal-600 dark:text-teal-400",
		surfaceClassName: "bg-teal-500/10 dark:bg-teal-500/20",
	},
	{
		value: "teal-bold",
		label: "Teal bold",
		swatchClassName: "bg-teal-600",
		chromeClassName: "bg-teal-600/20",
		iconClassName: "text-teal-700 dark:text-teal-400",
		surfaceClassName: "bg-teal-600/10 dark:bg-teal-500/20",
	},
	{
		value: "teal-deep",
		label: "Teal deep",
		swatchClassName: "bg-teal-700",
		chromeClassName: "bg-teal-700/20",
		iconClassName: "text-teal-700 dark:text-teal-300",
		surfaceClassName: "bg-teal-700/10 dark:bg-teal-500/20",
	},
	{
		value: "sky-soft",
		label: "Sky soft",
		swatchClassName: "bg-sky-300",
		checkClassName: "text-sky-950",
		chromeClassName: "bg-sky-300/20",
		iconClassName: "text-sky-500 dark:text-sky-300",
		surfaceClassName: "bg-sky-300/10 dark:bg-sky-400/20",
	},
	{
		value: "sky",
		label: "Sky",
		swatchClassName: "bg-sky-500",
		chromeClassName: "bg-sky-500/20",
		iconClassName: "text-sky-600 dark:text-sky-400",
		surfaceClassName: "bg-sky-500/10 dark:bg-sky-500/20",
	},
	{
		value: "sky-bold",
		label: "Sky bold",
		swatchClassName: "bg-sky-600",
		chromeClassName: "bg-sky-600/20",
		iconClassName: "text-sky-700 dark:text-sky-400",
		surfaceClassName: "bg-sky-600/10 dark:bg-sky-500/20",
	},
	{
		value: "sky-deep",
		label: "Sky deep",
		swatchClassName: "bg-sky-700",
		chromeClassName: "bg-sky-700/20",
		iconClassName: "text-sky-700 dark:text-sky-300",
		surfaceClassName: "bg-sky-700/10 dark:bg-sky-500/20",
	},
	{
		value: "violet-soft",
		label: "Violet soft",
		swatchClassName: "bg-violet-300",
		checkClassName: "text-violet-950",
		chromeClassName: "bg-violet-300/20",
		iconClassName: "text-violet-500 dark:text-violet-300",
		surfaceClassName: "bg-violet-300/10 dark:bg-violet-400/20",
	},
	{
		value: "violet",
		label: "Violet",
		swatchClassName: "bg-violet-500",
		chromeClassName: "bg-violet-500/20",
		iconClassName: "text-violet-600 dark:text-violet-400",
		surfaceClassName: "bg-violet-500/10 dark:bg-violet-500/20",
	},
	{
		value: "violet-bold",
		label: "Violet bold",
		swatchClassName: "bg-violet-600",
		chromeClassName: "bg-violet-600/20",
		iconClassName: "text-violet-700 dark:text-violet-400",
		surfaceClassName: "bg-violet-600/10 dark:bg-violet-500/20",
	},
	{
		value: "violet-deep",
		label: "Violet deep",
		swatchClassName: "bg-violet-700",
		chromeClassName: "bg-violet-700/20",
		iconClassName: "text-violet-700 dark:text-violet-300",
		surfaceClassName: "bg-violet-700/10 dark:bg-violet-500/20",
	},
	{
		value: "rose-soft",
		label: "Rose soft",
		swatchClassName: "bg-rose-300",
		checkClassName: "text-rose-950",
		chromeClassName: "bg-rose-300/20",
		iconClassName: "text-rose-500 dark:text-rose-300",
		surfaceClassName: "bg-rose-300/10 dark:bg-rose-400/20",
	},
	{
		value: "rose",
		label: "Rose",
		swatchClassName: "bg-rose-500",
		chromeClassName: "bg-rose-500/20",
		iconClassName: "text-rose-600 dark:text-rose-400",
		surfaceClassName: "bg-rose-500/10 dark:bg-rose-500/20",
	},
	{
		value: "rose-bold",
		label: "Rose bold",
		swatchClassName: "bg-rose-600",
		chromeClassName: "bg-rose-600/20",
		iconClassName: "text-rose-700 dark:text-rose-400",
		surfaceClassName: "bg-rose-600/10 dark:bg-rose-500/20",
	},
	{
		value: "rose-deep",
		label: "Rose deep",
		swatchClassName: "bg-rose-700",
		chromeClassName: "bg-rose-700/20",
		iconClassName: "text-rose-700 dark:text-rose-300",
		surfaceClassName: "bg-rose-700/10 dark:bg-rose-500/20",
	},
] as const satisfies ReadonlyArray<WorkspaceColorDefinition>;

export const workspaceColors = Object.fromEntries(
	workspaceColorOptions.map((color) => [color.value, color]),
) as Record<WorkspaceColor, WorkspaceColorDefinition>;

export function getRandomWorkspaceColor(): WorkspaceColor {
	const randomIndex = Math.floor(Math.random() * workspaceColorOptions.length);

	return workspaceColorOptions[randomIndex]?.value ?? "sky";
}
