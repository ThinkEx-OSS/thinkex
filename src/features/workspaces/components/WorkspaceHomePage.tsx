import { useSuspenseQuery } from "@tanstack/react-query";
import { ChevronDown, Mail, Search, X } from "lucide-react";
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
import CreateWorkspaceCard from "#/features/workspaces/components/CreateWorkspaceCard";
import WorkspaceCard from "#/features/workspaces/components/WorkspaceCard";
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

const workspaceHomeCommunityLinkOrder = ["Discord", "Reddit", "Twitter / X", "GitHub"];

export function WorkspaceHomePage() {
	const { data: workspaces } = useSuspenseQuery(workspacesQueryOptions());
	const createWorkspaceMutation = useCreateWorkspaceMutation();
	const persistedStoresHydrated = useWorkspacePersistedStoresHydrated();
	const [workspaceSearch, setWorkspaceSearch] = useState("");
	const filteredWorkspaces = filterWorkspaces(workspaces, workspaceSearch);
	const hasWorkspaceSearch = workspaceSearch.trim().length > 0;

	return (
		<AppShell
			navbarControls={
				<WorkspaceHomeNavbarControls
					searchValue={workspaceSearch}
					onSearchChange={setWorkspaceSearch}
				/>
			}
			siteControls={<WorkspaceHomeCommunityMenu />}
		>
			<div className="space-y-4 pb-8">
				<section className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4">
					<CreateWorkspaceCard
						onCreate={() => createWorkspaceMutation.mutate()}
						pending={createWorkspaceMutation.isPending}
					/>
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
				</section>
			</div>
		</AppShell>
	);
}

function WorkspaceHomeNavbarControls({
	searchValue,
	onSearchChange,
}: {
	searchValue: string;
	onSearchChange: Dispatch<SetStateAction<string>>;
}) {
	const searchInputRef = useRef<HTMLInputElement>(null);
	useTypeToFocusTextInput({
		enabled: true,
		inputRef: searchInputRef,
		setValue: onSearchChange,
	});

	return (
		<div className="flex w-full min-w-0 items-center justify-center">
			<div className="relative w-full min-w-0 max-w-72">
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
				{searchValue ? (
					<button
						type="button"
						aria-label="Clear workspace search"
						className="absolute top-1/2 right-2 flex size-5 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
						onClick={() => onSearchChange("")}
					>
						<X className="size-3.5" strokeWidth={1.75} />
					</button>
				) : null}
			</div>
		</div>
	);
}

function NoWorkspaceSearchResultsCard({ search }: { search: string }) {
	return (
		<Card className="gap-0 overflow-hidden border-transparent bg-muted/10 py-0 shadow-none ring-0 dark:bg-muted/5">
			<div className="flex w-full flex-col rounded-xl text-left">
				<div className="flex aspect-[5/2] items-center justify-center">
					<Search className="size-11 text-muted-foreground/70" strokeWidth={1.75} />
				</div>

				<CardHeader className="gap-2 px-4 py-3">
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
						className="h-8 px-2 text-muted-foreground hover:text-foreground"
					/>
				}
			>
				Community
				<ChevronDown className="size-4" />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-48">
				<DropdownMenuGroup>
					{orderedCommunityLinks.map(({ href, label, icon: Icon }) => (
						<DropdownMenuItem
							key={href}
							render={<a href={href} target="_blank" rel="noopener noreferrer" />}
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
	const query = search.trim().toLocaleLowerCase();
	if (!query) {
		return workspaces;
	}

	return workspaces.filter((workspace) => workspace.name.toLocaleLowerCase().includes(query));
}
