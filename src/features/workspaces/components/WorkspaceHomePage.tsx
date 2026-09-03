import { useSuspenseQuery } from "@tanstack/react-query";
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { Archive, Mail, Search, UsersRound, X } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import AppShell from "#/components/AppShell";
import { communityLinks, CONTACT_EMAIL } from "#/components/community-links";
import { Button } from "#/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { Input } from "#/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "#/components/ui/tooltip";
import CreateWorkspaceCard from "#/features/workspaces/components/CreateWorkspaceCard";
import WorkspaceCard from "#/features/workspaces/components/WorkspaceCard";
import { WorkspaceGrid } from "#/features/workspaces/components/WorkspaceGrid";
import WorkspaceHomeEmptyState from "#/features/workspaces/components/WorkspaceHomeEmptyState";
import {
	getWorkspaceRootTabSearch,
	getWorkspaceSessionTabSearch,
} from "#/features/workspaces/model/tabs";
import { workspacesQueryOptions } from "#/features/workspaces/query-options";
import { useWorkspacePersistedStoresHydrated } from "#/features/workspaces/state/persisted-store-hydration";
import { useWorkspaceTabsStore } from "#/features/workspaces/state/workspace-tabs-store";
import { useCreateWorkspaceMutation } from "#/features/workspaces/use-create-workspace";
import { useCopyToClipboard } from "#/hooks/use-copy-to-clipboard";
import { useTypeToFocusTextInput } from "#/hooks/use-type-to-focus-text-input";
import { rankNameSearch } from "#/lib/name-search";

const workspaceHomeCommunityLinkOrder = ["Discord", "Twitter / X", "GitHub"];
type WorkspaceCollection = "active" | "archived";
const routeApi = getRouteApi("/_protected/home");

export function WorkspaceHomePage() {
	const { data: workspaces } = useSuspenseQuery(workspacesQueryOptions());
	const { view } = routeApi.useSearch({
		select: (search) => ({ view: search.view }),
	});
	const navigate = useNavigate();
	const createWorkspaceMutation = useCreateWorkspaceMutation();
	const persistedStoresHydrated = useWorkspacePersistedStoresHydrated();
	const [workspaceSearch, setWorkspaceSearch] = useState("");
	const workspaceCollection: WorkspaceCollection = view === "archived" ? "archived" : "active";
	const activeWorkspaces = workspaces.filter(
		(workspace) => workspace.archivedForCurrentUserAt === null,
	);
	const archivedWorkspaces = workspaces.filter(
		(workspace) => workspace.archivedForCurrentUserAt !== null,
	);
	const collectionWorkspaces =
		workspaceCollection === "active" ? activeWorkspaces : archivedWorkspaces;
	const filteredWorkspaces = filterWorkspaces(collectionWorkspaces, workspaceSearch);
	const hasWorkspaceSearch = workspaceSearch.trim().length > 0;
	const hasWorkspaces = workspaces.length > 0;
	const showWorkspaceHomeEmptyState =
		workspaceCollection === "active" && collectionWorkspaces.length === 0 && !hasWorkspaceSearch;
	const showArchiveEmptyState =
		workspaceCollection === "archived" && collectionWorkspaces.length === 0;
	const handleCreateWorkspace = () => createWorkspaceMutation.mutate({ id: crypto.randomUUID() });
	const handleWorkspaceCollectionChange = (collection: WorkspaceCollection) => {
		setWorkspaceSearch("");
		void navigate({
			to: "/home",
			search: (previous) => ({
				...previous,
				view: collection === "archived" ? "archived" : undefined,
			}),
		});
	};

	return (
		<AppShell
			navbarControls={
				hasWorkspaces ? (
					<WorkspaceHomeNavbarControls
						archivedCount={archivedWorkspaces.length}
						searchValue={workspaceSearch}
						workspaceCollection={workspaceCollection}
						onSearchChange={setWorkspaceSearch}
						onWorkspaceCollectionChange={handleWorkspaceCollectionChange}
					/>
				) : undefined
			}
			siteControls={<WorkspaceHomeCommunityMenu />}
		>
			<div className="pb-8">
				{showWorkspaceHomeEmptyState ? (
					<WorkspaceHomeEmptyState
						onCreate={handleCreateWorkspace}
						pending={createWorkspaceMutation.isPending}
					/>
				) : showArchiveEmptyState ? (
					<EmptyArchive />
				) : (
					<WorkspaceGrid>
						{workspaceCollection === "active" ? (
							<CreateWorkspaceCard
								onCreate={handleCreateWorkspace}
								pending={createWorkspaceMutation.isPending}
							/>
						) : null}
						{filteredWorkspaces.map((workspace) => (
							<WorkspaceCard
								key={workspace.id}
								workspace={workspace}
								search={getWorkspaceCardSearch(workspace.id, persistedStoresHydrated)}
							/>
						))}
						{hasWorkspaceSearch && filteredWorkspaces.length === 0 ? (
							<NoWorkspaceSearchResultsCard search={workspaceSearch} />
						) : null}
					</WorkspaceGrid>
				)}
			</div>
		</AppShell>
	);
}

function EmptyArchive() {
	return (
		<div className="flex flex-col items-center justify-center space-y-1 py-24 text-center">
			<h2 className="font-medium">No archived workspaces</h2>
			<p className="text-sm text-muted-foreground">Archived workspaces will appear here.</p>
		</div>
	);
}

function WorkspaceHomeNavbarControls({
	archivedCount,
	searchValue,
	workspaceCollection,
	onSearchChange,
	onWorkspaceCollectionChange,
}: {
	archivedCount: number;
	searchValue: string;
	workspaceCollection: WorkspaceCollection;
	onSearchChange: Dispatch<SetStateAction<string>>;
	onWorkspaceCollectionChange: (collection: WorkspaceCollection) => void;
}) {
	const searchInputRef = useRef<HTMLInputElement>(null);
	useTypeToFocusTextInput({
		enabled: true,
		inputRef: searchInputRef,
		setValue: onSearchChange,
	});

	return (
		<div className="flex w-full min-w-0 items-center justify-center gap-2">
			<div className="relative hidden w-full min-w-0 max-w-72 sm:block">
				<Search
					aria-hidden="true"
					className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
				/>
				<Input
					ref={searchInputRef}
					type="text"
					value={searchValue}
					onChange={(event) => onSearchChange(event.currentTarget.value)}
					placeholder="Search workspaces"
					aria-label="Search workspaces"
					className="h-8 bg-background/70 pr-8 pl-8 text-sm shadow-none"
				/>
				{/* Opaque color, not `/70`: the X's strokes cross, and an alpha paint
				    double-composites at the crossing into a visible darker notch. */}
				{searchValue ? (
					<button
						type="button"
						aria-label="Clear workspace search"
						className="absolute top-1/2 right-2 flex size-5 -translate-y-1/2 items-center justify-center rounded-sm text-[color-mix(in_oklch,var(--muted-foreground)_70%,var(--background))] transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
						onClick={() => onSearchChange("")}
					>
						<X className="size-3.5" strokeWidth={1.75} />
					</button>
				) : null}
			</div>

			<Tooltip>
				<TooltipTrigger
					render={
						<Button
							variant="ghost"
							size="icon-sm"
							className={
								workspaceCollection === "archived"
									? "bg-background/70 text-muted-foreground shadow-xs hover:text-foreground"
									: "text-muted-foreground hover:text-foreground"
							}
							aria-label={
								workspaceCollection === "archived"
									? "Show active workspaces"
									: "Show archived workspaces"
							}
							aria-pressed={workspaceCollection === "archived"}
							onClick={() =>
								onWorkspaceCollectionChange(
									workspaceCollection === "active" ? "archived" : "active",
								)
							}
						/>
					}
				>
					<Archive />
				</TooltipTrigger>
				<TooltipContent>
					{workspaceCollection === "archived"
						? "Show active workspaces"
						: `Show archived workspaces (${archivedCount})`}
				</TooltipContent>
			</Tooltip>
		</div>
	);
}

function NoWorkspaceSearchResultsCard({ search }: { search: string }) {
	return (
		<Card className="gap-0 overflow-hidden border-transparent bg-muted/10 py-0 shadow-none ring-0 dark:bg-muted/5">
			<div className="flex w-full flex-row items-center rounded-xl text-left sm:flex-col sm:items-stretch">
				<div className="flex size-14 shrink-0 items-center justify-center sm:aspect-[5/2] sm:size-auto sm:w-full">
					{/* Opaque: the handle meets the lens circle, and an alpha paint
					    darkens that overlap into a seam. */}
					<Search
						className="size-6 text-[color-mix(in_oklch,var(--muted-foreground)_70%,var(--background))] sm:size-11"
						strokeWidth={1.75}
					/>
				</div>

				<CardHeader className="min-w-0 flex-1 gap-1 px-3 py-2.5 sm:gap-2 sm:px-4 sm:py-3">
					<CardTitle>No matching workspaces</CardTitle>
					<CardDescription className="truncate text-xs">
						Nothing matches "{search.trim()}"
					</CardDescription>
				</CardHeader>
			</div>
		</Card>
	);
}

function WorkspaceHomeCommunityMenu() {
	const { copy } = useCopyToClipboard({
		onCopy: () => toast.success("Email copied to clipboard"),
		onError: () => toast.error("Could not copy email"),
	});
	const orderedCommunityLinks = workspaceHomeCommunityLinkOrder.flatMap((label) =>
		communityLinks.filter((link) => link.label === label),
	);

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<Button
						variant="ghost"
						size="sm"
						aria-label="Community"
						className="size-10 px-0 text-muted-foreground hover:text-foreground sm:h-8 sm:w-auto sm:px-2"
					/>
				}
			>
				<UsersRound className="size-4" />
				<span className="hidden sm:inline">Community</span>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-48">
				<DropdownMenuGroup>
					{orderedCommunityLinks.map(({ href, label, icon: Icon }) => (
						<DropdownMenuItem
							key={href}
							render={
								<a href={href} target="_blank" rel="noopener noreferrer" aria-label={label} />
							}
						>
							<Icon className={label === "Twitter / X" ? "size-[15px]" : "size-4"} />
							{label}
						</DropdownMenuItem>
					))}
					<DropdownMenuSeparator />
					<DropdownMenuItem onClick={() => void copy(CONTACT_EMAIL)}>
						<Mail className="size-4" />
						Email
					</DropdownMenuItem>
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function getWorkspaceCardSearch(workspaceId: string, persistedStoresHydrated: boolean) {
	if (!persistedStoresHydrated) {
		return getWorkspaceRootTabSearch();
	}

	const session = useWorkspaceTabsStore.getState().getSession(workspaceId);

	return getWorkspaceSessionTabSearch(session);
}

function filterWorkspaces<TWorkspace extends { name: string }>(
	workspaces: TWorkspace[],
	search: string,
) {
	return rankNameSearch(search, workspaces, (workspace) => [workspace.name]);
}
