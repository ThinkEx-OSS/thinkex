import { Users } from "lucide-react";

import {
	type WorkspaceTheme,
	workspaceRoleLabels,
	workspaceRoles,
} from "#/features/workspaces/contracts";
import { cn } from "#/lib/utils";

/**
 * The theme art, globbed directly. Importing it through workspace-themes would
 * be tidier, but that module eagerly pulls 104 lucide icon components and runs
 * a registry assertion that throws at module scope — 22.5 KB gzip and a
 * white-screen risk on the page we rank on, for twelve pictures.
 */
const themeArt = import.meta.glob("../../features/workspaces/themes/*.webp", {
	eager: true,
	query: "?url",
	import: "default",
}) as Record<string, string>;

function getThemeArt(theme: WorkspaceTheme): string | undefined {
	return themeArt[`../../features/workspaces/themes/${theme}.webp`];
}

type ShowcaseWorkspace = {
	name: string;
	theme: WorkspaceTheme;
	role: (typeof workspaceRoles)[number];
	members: number;
};

/**
 * Ordered by how many people have actually done the thing, because the strip
 * starts at the left and the first few cards decide whether a visitor thinks
 * this is for them. Exams and lecture notes before theses and fundraising.
 */
const WORKSPACES: ReadonlyArray<ShowcaseWorkspace> = [
	{ name: "Final Exams", theme: "exam-prep", role: "owner", members: 1 },
	{ name: "Lecture Notes", theme: "lecture-notes", role: "owner", members: 1 },
	{ name: "Biology 101", theme: "biology", role: "viewer", members: 32 },
	{ name: "Learning Spanish", theme: "languages", role: "owner", members: 1 },
	{ name: "Reading List", theme: "reading-list", role: "owner", members: 1 },
	{ name: "Job Search", theme: "job-search", role: "owner", members: 1 },
	{ name: "Calculus II", theme: "mathematics", role: "editor", members: 4 },
	{ name: "History Essay", theme: "history", role: "owner", members: 2 },
	{ name: "Psych 101", theme: "psychology", role: "viewer", members: 18 },
	{ name: "Research Project", theme: "research-project", role: "owner", members: 3 },
	{ name: "Study Group", theme: "study-group", role: "editor", members: 5 },
	{ name: "Side Project", theme: "programming", role: "admin", members: 3 },
];

/**
 * Who this is actually for, shown rather than claimed. The workspace art already
 * exists for the picker, so the range of it does the arguing: a page that only
 * showed coursework would read as a student tool, and a page that only showed
 * dashboards would read as a work tool. Sits directly under the hero because
 * "is this for me" is the question that decides whether anyone keeps scrolling.
 */
export function WorkspaceShowcaseSection() {
	return (
		<section className="mt-14 sm:mt-16" aria-label="Ways people use ThinkEx">
			{/* Deliberately small and quiet, not a section heading. This sits directly
			    under the hero, and a full-size h2 here would compete with the h1 a few
			    hundred pixels above it. Centred because the strip below is full bleed
			    and symmetric, so a left-aligned line over it reads as misaligned. */}
			<h2 className="text-center text-sm font-medium text-muted-foreground">
				For everything you're working on
			</h2>
			{/* Full bleed: the row should run off both edges so the strip reads as
			    continuous rather than as a row that happens to end. */}
			<div className="relative left-1/2 mt-6 w-screen -translate-x-1/2 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]">
				<div className="flex gap-4 overflow-hidden py-2 [--landing-marquee-gap:1rem]">
					{/* Rendered twice so that as copy one leaves, copy two is already in
					    place behind it. Each copy animates its own full width plus the gap. */}
					{[0, 1].map((copy) => (
						<div
							key={copy}
							className="landing-marquee flex shrink-0 gap-4 motion-reduce:animate-none"
							aria-hidden={copy === 1}
						>
							{WORKSPACES.map((workspace) => (
								<ShowcaseCard key={workspace.name} workspace={workspace} />
							))}
						</div>
					))}
				</div>
			</div>
		</section>
	);
}

function ShowcaseCard({ workspace }: { workspace: ShowcaseWorkspace }) {
	const art = getThemeArt(workspace.theme);

	return (
		<article className="w-60 shrink-0 overflow-hidden rounded-xl border border-border bg-background sm:w-64 dark:bg-black">
			{art ? (
				<img
					src={art}
					alt=""
					width={960}
					height={384}
					loading="lazy"
					decoding="async"
					className="aspect-[5/2] w-full object-cover opacity-90"
				/>
			) : (
				<div className="aspect-[5/2] w-full bg-muted" />
			)}
			<div className="min-w-0 px-3 py-2.5">
				<p className="truncate text-sm font-medium">{workspace.name}</p>
				{/* Mirrors the app's own card footer: role on the left, a hairline
				    divider, then the collaborator count on the right. */}
				<div className="mt-1 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
					<span className="min-w-0 flex-1 truncate">{workspaceRoleLabels[workspace.role]}</span>
					<span aria-hidden="true" className="h-3 w-px shrink-0 bg-border/70" />
					<span
						className={cn(
							"flex shrink-0 items-center gap-1 whitespace-nowrap",
							workspace.members === 1 && "opacity-70",
						)}
					>
						<Users className="size-3" aria-hidden="true" />
						{workspace.members === 1 ? "Just you" : workspace.members}
					</span>
				</div>
			</div>
		</article>
	);
}
