import { ChevronDown, Search, Trash2 } from "lucide-react";
import {
	type Dispatch,
	type FormEvent,
	type ReactElement,
	type SetStateAction,
	useId,
	useState,
} from "react";

import { Button } from "#/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "#/components/ui/dialog";
import { Field, FieldGroup, FieldTitle } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "#/components/ui/toggle-group";
import { Label } from "#/components/ui/label";
import {
	Popover,
	PopoverContent,
	PopoverDescription,
	PopoverHeader,
	PopoverTitle,
	PopoverTrigger,
} from "#/components/ui/popover";
import type { WorkspaceSummary } from "#/features/workspaces/contracts";
import { DEFAULT_WORKSPACE_THEME } from "#/features/workspaces/defaults";
import {
	filterWorkspaceThemeOptions,
	defaultWorkspaceTheme,
	getWorkspaceTheme,
	getWorkspaceThemeArtByValue,
	resolveWorkspaceTheme,
	workspaceThemeGroups,
	workspaceThemeOptions,
} from "#/features/workspaces/model/workspace-themes";
import { useDeleteWorkspaceMutation } from "#/features/workspaces/use-delete-workspace";
import { useUpdateWorkspaceMutation } from "#/features/workspaces/use-update-workspace";
import type { WorkspaceMemberCapabilities } from "#/features/workspaces/workspace-member-capabilities";
import { cn } from "#/lib/utils";

interface WorkspaceSettingsDialogProps {
	workspace: WorkspaceSummary;
	capabilities: WorkspaceMemberCapabilities;
	trigger?: ReactElement;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
}

interface WorkspaceSettingsDraft {
	name: string;
	theme: string;
}

const getWorkspaceSettingsDraft = (workspace: WorkspaceSummary): WorkspaceSettingsDraft => ({
	name: workspace.name,
	// Resolved through the same call the card's artwork uses, so the picker can
	// never name a different theme than the one on screen.
	theme: resolveWorkspaceTheme(workspace).value,
});

export default function WorkspaceSettingsDialog({
	workspace,
	capabilities,
	trigger,
	open: controlledOpen,
	onOpenChange: controlledOnOpenChange,
}: WorkspaceSettingsDialogProps) {
	const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
	const [draft, setDraft] = useState(() => getWorkspaceSettingsDraft(workspace));
	const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
	const open = controlledOpen ?? uncontrolledOpen;

	if (!capabilities.canMutateContent) {
		return null;
	}

	const handleOpenChange = (nextOpen: boolean) => {
		if (nextOpen) {
			setDraft(getWorkspaceSettingsDraft(workspace));
			setIsConfirmingDelete(false);
		}

		controlledOnOpenChange?.(nextOpen);

		if (controlledOpen === undefined) {
			setUncontrolledOpen(nextOpen);
		}
	};

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			{trigger ? <DialogTrigger render={trigger} /> : null}
			<WorkspaceSettingsDialogContent
				canDelete={capabilities.canDeleteWorkspace}
				draft={draft}
				isConfirmingDelete={isConfirmingDelete}
				setDraft={setDraft}
				setIsConfirmingDelete={setIsConfirmingDelete}
				workspace={workspace}
				onOpenChange={handleOpenChange}
			/>
		</Dialog>
	);
}

function WorkspaceSettingsDialogContent({
	canDelete,
	draft,
	isConfirmingDelete,
	setDraft,
	setIsConfirmingDelete,
	workspace,
	onOpenChange,
}: {
	canDelete: boolean;
	draft: WorkspaceSettingsDraft;
	isConfirmingDelete: boolean;
	setDraft: Dispatch<SetStateAction<WorkspaceSettingsDraft>>;
	setIsConfirmingDelete: Dispatch<SetStateAction<boolean>>;
	workspace: WorkspaceSummary;
	onOpenChange: (open: boolean) => void;
}) {
	const nameInputId = useId();
	const [themePickerOpen, setThemePickerOpen] = useState(false);
	const updateWorkspaceMutation = useUpdateWorkspaceMutation();
	const deleteWorkspaceMutation = useDeleteWorkspaceMutation();
	const workspaceDraft = getWorkspaceSettingsDraft(workspace);
	const chosenTheme = getWorkspaceTheme(draft.theme);
	const savedTheme = chosenTheme ?? defaultWorkspaceTheme;
	const normalizedName = draft.name.trim();
	const canSave =
		normalizedName.length > 0 &&
		!updateWorkspaceMutation.isPending &&
		(normalizedName !== workspace.name || draft.theme !== workspaceDraft.theme);
	const updateError =
		updateWorkspaceMutation.error instanceof Error ? updateWorkspaceMutation.error.message : null;
	const deleteError =
		deleteWorkspaceMutation.error instanceof Error ? deleteWorkspaceMutation.error.message : null;

	const handleSave = () => {
		if (!canSave) {
			return;
		}

		onOpenChange(false);
		updateWorkspaceMutation.mutate({
			workspaceId: workspace.id,
			name: normalizedName,
			// Icon and colour are properties of the theme, never picked separately.
			icon: savedTheme.icon,
			color: savedTheme.color,
			theme: savedTheme.value,
		});
	};

	const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		handleSave();
	};

	const handleDeleteWorkspace = () => {
		onOpenChange(false);
		deleteWorkspaceMutation.mutate({
			workspaceId: workspace.id,
			confirmationName: workspace.name,
		});
	};

	return (
		<DialogContent className="sm:max-w-lg">
			<form className="grid gap-6" onSubmit={handleSubmit}>
				<DialogHeader>
					<DialogTitle>Workspace settings</DialogTitle>
					<DialogDescription>Update this workspace's name and theme.</DialogDescription>
				</DialogHeader>

				<FieldGroup className="gap-5">
					<Field>
						<Label htmlFor={nameInputId}>Name</Label>
						<Input
							id={nameInputId}
							value={draft.name}
							onChange={(event) =>
								setDraft((current) => ({
									...current,
									name: event.target.value,
								}))
							}
							maxLength={120}
							aria-invalid={normalizedName.length === 0}
						/>
					</Field>

					<Field>
						<FieldTitle>Theme</FieldTitle>
						<WorkspaceThemePicker
							open={themePickerOpen}
							value={draft.theme}
							onOpenChange={setThemePickerOpen}
							onValueChange={(theme) => {
								setDraft((current) => ({ ...current, theme }));
								setThemePickerOpen(false);
							}}
						/>
					</Field>

					{updateError || deleteError ? (
						<p className="text-destructive text-sm">{deleteError ?? updateError}</p>
					) : null}
				</FieldGroup>

				<DialogFooter layout="split">
					{canDelete ? (
						<Popover open={isConfirmingDelete} onOpenChange={setIsConfirmingDelete}>
							<PopoverTrigger
								render={
									<Button
										type="button"
										variant="ghost"
										className="text-destructive hover:bg-destructive/10 hover:text-destructive"
										disabled={deleteWorkspaceMutation.isPending}
									>
										<Trash2 className="size-4" />
										Delete
									</Button>
								}
							/>
							<PopoverContent align="start" side="top" className="w-80">
								<PopoverHeader>
									<PopoverTitle className="text-destructive">Delete workspace?</PopoverTitle>
									<PopoverDescription>
										Permanently deletes "{workspace.name}" and its contents.
									</PopoverDescription>
								</PopoverHeader>
								<div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
									<Button
										type="button"
										variant="outline"
										disabled={deleteWorkspaceMutation.isPending}
										onClick={() => setIsConfirmingDelete(false)}
									>
										Cancel
									</Button>
									<Button
										type="button"
										variant="destructive"
										disabled={deleteWorkspaceMutation.isPending}
										onClick={handleDeleteWorkspace}
									>
										Confirm
									</Button>
								</div>
							</PopoverContent>
						</Popover>
					) : (
						<div />
					)}
					<div className="flex flex-row gap-2">
						<Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
							Cancel
						</Button>
						<Button type="submit" disabled={!canSave}>
							Save
						</Button>
					</div>
				</DialogFooter>
			</form>
		</DialogContent>
	);
}

function WorkspaceThemePicker({
	open,
	value,
	onOpenChange,
	onValueChange,
}: {
	open: boolean;
	value: string;
	onOpenChange: (open: boolean) => void;
	onValueChange: (value: string) => void;
}) {
	const [query, setQuery] = useState("");
	const [group, setGroup] = useState<string | null>(null);
	const selected = workspaceThemeOptions.find((option) => option.value === value);
	const results = filterWorkspaceThemeOptions(query, group);
	const previewArt = getWorkspaceThemeArtByValue(value);

	// A 117-item grid does not fit in a popup anchored inside a 32rem dialog —
	// it ends up wider than its container and re-flips every time filtering
	// changes its height. A dialog is centred, so it cannot flip.
	const handleOpenChange = (nextOpen: boolean) => {
		if (!nextOpen) {
			setQuery("");
			setGroup(null);
		}

		onOpenChange(nextOpen);
	};

	const choose = (next: string) => {
		onValueChange(next);
		handleOpenChange(false);
	};

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogTrigger
				render={
					<Button type="button" variant="outline" className="h-auto w-full justify-between p-2">
						<span className="flex min-w-0 items-center gap-3">
							<img
								src={previewArt}
								alt=""
								className="aspect-[5/2] h-10 shrink-0 rounded-sm object-cover"
							/>
							<span className="truncate">{selected?.label ?? "Default"}</span>
						</span>
						<ChevronDown className="size-4 shrink-0 text-muted-foreground" />
					</Button>
				}
			/>
			<DialogContent nested className="sm:max-w-4xl">
				<DialogHeader>
					<DialogTitle>Choose a theme</DialogTitle>
				</DialogHeader>

				<div className="relative">
					<Search
						className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-2.5 size-4 text-muted-foreground"
						aria-hidden="true"
					/>
					<Input
						value={query}
						aria-label="Search themes"
						placeholder="Search themes"
						className="h-9 pl-8"
						onChange={(event) => {
							setQuery(event.target.value);
							// Searching is global. Clearing the group keeps the chips
							// honest — a pressed chip alongside cross-group results
							// would be showing state that is not being applied.
							if (event.target.value.trim()) {
								setGroup(null);
							}
						}}
					/>
				</div>

				<ToggleGroup
					value={group ? [group] : []}
					onValueChange={(next) => setGroup((next[0] as string | undefined) ?? null)}
					variant="outline"
					size="sm"
					className="flex-wrap"
				>
					{workspaceThemeGroups.map((option) => (
						<ToggleGroupItem key={option} value={option}>
							{option}
						</ToggleGroupItem>
					))}
				</ToggleGroup>

				{/* Fixed height so the dialog does not jump as you filter.
				    content-start is load-bearing: a grid with a fixed height
				    stretches its rows to fill by default, which squashes every
				    row instead of overflowing, so the scrollbar never appears. */}
				<div className="-m-1 grid h-96 auto-rows-min content-start grid-cols-2 gap-2 overflow-y-auto p-1 sm:grid-cols-4">
					{!group && !query.trim() ? (
						<button
							type="button"
							title="Default"
							className={cn(
								"overflow-hidden rounded-md outline-none ring-offset-2 ring-offset-popover transition-shadow focus-visible:ring-3 focus-visible:ring-ring/50",
								value === DEFAULT_WORKSPACE_THEME && "ring-2 ring-foreground",
							)}
							aria-label="Default"
							aria-pressed={value === DEFAULT_WORKSPACE_THEME}
							onClick={() => choose(DEFAULT_WORKSPACE_THEME)}
						>
							<img
								src={getWorkspaceThemeArtByValue(DEFAULT_WORKSPACE_THEME)}
								alt=""
								className="aspect-[5/2] w-full object-cover"
							/>
						</button>
					) : null}

					{results.map((option) => (
						<button
							key={option.value}
							type="button"
							title={`${option.label} — ${option.group}`}
							className={cn(
								"overflow-hidden rounded-md outline-none ring-offset-2 ring-offset-popover transition-shadow focus-visible:ring-3 focus-visible:ring-ring/50",
								value === option.value && "ring-2 ring-foreground",
							)}
							aria-label={option.label}
							aria-pressed={value === option.value}
							onClick={() => choose(option.value)}
						>
							<img
								src={getWorkspaceThemeArtByValue(option.value)}
								alt=""
								loading="lazy"
								decoding="async"
								className="aspect-[5/2] w-full object-cover"
							/>
						</button>
					))}

					{results.length === 0 ? (
						<p className="col-span-full py-6 text-center text-muted-foreground text-sm">
							No themes found.
						</p>
					) : null}
				</div>
			</DialogContent>
		</Dialog>
	);
}
