import { Check, Minus, X } from "lucide-react";

import { CONTACT_EMAIL } from "#/components/community-links";
import { cn } from "#/lib/utils";

// Every claim here is a public statement about someone else's product, so each
// cell carries the qualifier that makes it defensible ("Gemini only", "markdown
// only"). A partial that reads as honest buys more trust for our own row than a
// grid of green checks ever would. Recheck the dated footnote when editing.

type SupportLevel = "full" | "partial" | "none";

type Support = {
	level: SupportLevel;
	note?: string;
};

const CAPABILITIES = [
	{ id: "sources", label: "Interact with your sources" },
	{ id: "models", label: "Choose your AI" },
	{ id: "collaborate", label: "Live collaboration" },
] as const;

type CapabilityId = (typeof CAPABILITIES)[number]["id"];

type ToolRow = {
	name: string;
	highlighted?: boolean;
	support: Record<CapabilityId, Support>;
};

const TOOLS: ReadonlyArray<ToolRow> = [
	{
		name: "ThinkEx",
		highlighted: true,
		// Our own row stays bare: a qualifier under our checks restates the column
		// header and reads as bragging. The competitor notes stay, because an
		// unexplained mark against someone else's product is both harsher and
		// harder to defend than one carrying its reason.
		support: {
			sources: { level: "full" },
			models: { level: "full" },
			collaborate: { level: "full" },
		},
	},
	{
		name: "Gemini Notebook (NotebookLM)",
		support: {
			sources: { level: "partial", note: "No organization/interactivity" },
			models: { level: "none", note: "Slow and incapable" },
			collaborate: { level: "none", note: "No co-editable docs" },
		},
	},
	{
		name: "ChatGPT.com, Claude.ai",
		support: {
			sources: { level: "none", note: "Uploads get lost in chat" },
			models: { level: "partial", note: "Limited models and features" },
			collaborate: { level: "none" },
		},
	},
	{
		name: "Obsidian",
		support: {
			sources: { level: "partial", note: "Markdown only" },
			models: { level: "partial", note: "Bring your own plugins" },
			collaborate: { level: "none" },
		},
	},
	{
		name: "Notion",
		support: {
			sources: { level: "partial", note: "Only Notion docs" },
			models: { level: "full" },
			collaborate: { level: "full" },
		},
	},
];

/** How ThinkEx compares to the tools people already use. */
export function ComparisonSection() {
	return (
		<section className="mt-14 sm:mt-20" aria-label="How others compare">
			<h2 className="max-w-2xl text-3xl font-medium tracking-tight text-balance sm:text-4xl">
				How others compare
			</h2>

			{/* Two renderings of one dataset: a five-column grid is unreadable on a
			    phone, and the hidden branch drops out of the a11y tree either way. */}
			<div className="mt-6 hidden overflow-hidden rounded-md border border-border bg-background md:block dark:bg-black">
				<table className="w-full border-collapse text-left">
					<thead>
						{/* divide-x rather than a border on every cell: it draws the rule
						    between columns only, so the outer rounded border stays clean. */}
						<tr className="divide-x divide-border/60 border-border border-b">
							<th scope="col" className="w-[26%] px-5 py-4 text-sm font-medium">
								<span className="sr-only">Tool</span>
							</th>
							{CAPABILITIES.map((capability) => (
								<th
									key={capability.id}
									scope="col"
									className="px-4 py-4 text-center text-sm font-medium text-balance"
								>
									{capability.label}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{TOOLS.map((tool) => (
							<tr
								key={tool.name}
								className={cn(
									"divide-x divide-border/60 border-border/60 border-b last:border-b-0",
									tool.highlighted && "bg-muted/45 dark:bg-white/[0.055]",
								)}
							>
								{/* Every cell centers in the row. Rows vary in height because only
								    some cells carry a note, so anything else leaves the short
								    cells — a bare name, a lone icon — floating away from the
								    middle once the column rules make the row edges visible. */}
								{/* Only our row carries the heavier weight, so the eye lands on it
								    before reading any of the marks. */}
								<th
									scope="row"
									className={cn(
										"px-5 py-5 align-middle text-base tracking-tight",
										tool.highlighted ? "font-medium" : "font-normal text-muted-foreground",
									)}
								>
									{tool.name}
								</th>
								{CAPABILITIES.map((capability) => (
									<td key={capability.id} className="px-4 py-5 align-middle">
										<SupportCell support={tool.support[capability.id]} />
									</td>
								))}
							</tr>
						))}
					</tbody>
				</table>
			</div>

			<div className="mt-6 grid gap-5 sm:grid-cols-2 md:hidden">
				{TOOLS.map((tool) => (
					<article
						key={tool.name}
						className={cn(
							"rounded-md border border-border bg-background p-5 dark:bg-black",
							tool.highlighted && "bg-muted/45 dark:bg-white/[0.055]",
						)}
					>
						<h3
							className={cn(
								"text-xl tracking-tight",
								tool.highlighted ? "font-medium" : "font-normal text-muted-foreground",
							)}
						>
							{tool.name}
						</h3>
						<dl className="mt-4 grid gap-3 border-border/60 border-t pt-4">
							{CAPABILITIES.map((capability) => {
								const support = tool.support[capability.id];

								return (
									// The note sits under the label rather than beside it: on a phone
									// the two competed for the same line and both wrapped to shreds.
									<div
										key={capability.id}
										className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4"
									>
										<dt className="text-sm leading-6">{capability.label}</dt>
										<dd className="flex shrink-0 items-center">
											<SupportIcon level={support.level} />
										</dd>
										{support.note ? (
											<dd className="col-start-1 text-xs leading-5 text-muted-foreground">
												{support.note}
											</dd>
										) : null}
									</div>
								);
							})}
						</dl>
					</article>
				))}
			</div>

			<p className="mt-5 text-center text-sm text-muted-foreground">
				Compared as of August 2026. If something here is out of date,{" "}
				<a
					href={`mailto:${CONTACT_EMAIL}`}
					className="font-medium text-foreground underline-offset-4 hover:underline"
				>
					tell us
				</a>
				.
			</p>
		</section>
	);
}

function SupportCell({ support }: { support: Support }) {
	return (
		<div className="flex flex-col items-center gap-1 text-center">
			<SupportIcon level={support.level} />
			{support.note ? (
				<span className="text-xs leading-5 text-muted-foreground text-balance">{support.note}</span>
			) : null}
		</div>
	);
}

// Solid colors, never alpha. An alpha paint is applied per-path, so the two
// strokes of the X double-composite where they cross and the mark shows a darker
// notch at its own centre. color-mix lands the same value opaquely.
const SUPPORT_ICONS = {
	// Green reads as "yes" on sight, so it belongs to the level and not to our
	// row — Notion earns the same green where it earns the same check.
	full: { Icon: Check, label: "Yes", className: "text-emerald-600 dark:text-emerald-400" },
	partial: { Icon: Minus, label: "Partial", className: "text-muted-foreground" },
	none: {
		Icon: X,
		label: "No",
		className: "text-[color-mix(in_oklch,var(--muted-foreground)_55%,var(--background))]",
	},
} as const;

function SupportIcon({ level }: { level: SupportLevel }) {
	const { Icon, label, className } = SUPPORT_ICONS[level];

	return (
		<>
			<Icon className={cn("size-5 shrink-0", className)} aria-hidden="true" />
			<span className="sr-only">{label}</span>
		</>
	);
}
