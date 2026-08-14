import { List, LoaderCircle, RotateCcw, Shuffle, XCircle } from "lucide-react";
import { useState } from "react";

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "#/components/ui/alert-dialog";

import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import {
	WorkspaceResponsiveToolbar,
	WorkspaceToolbarIconButton,
	WorkspaceToolbarTextButton,
} from "#/features/workspaces/components/WorkspaceToolbar";
import type { FlashcardStudyMode } from "#/features/workspaces/flashcards/flashcard-study-session";
import { cn } from "#/lib/utils";

export function FlashcardToolbar({
	canReset,
	isResetting,
	missedCount,
	mode,
	shuffled,
	onModeChange,
	onReset,
	onShuffleToggle,
}: {
	canReset: boolean;
	isResetting: boolean;
	missedCount: number;
	mode: FlashcardStudyMode;
	shuffled: boolean;
	onModeChange: (mode: FlashcardStudyMode) => void;
	onReset: () => void;
	onShuffleToggle: () => void;
}) {
	const [isConfirmingReset, setIsConfirmingReset] = useState(false);
	return (
		<>
			<WorkspaceResponsiveToolbar
				mobileLabel="Flashcard study options"
				scrollable
				mobileContent={
					<FlashcardActionsMenuContent
						canReset={canReset}
						isResetting={isResetting}
						missedCount={missedCount}
						mode={mode}
						shuffled={shuffled}
						onModeChange={onModeChange}
						onReset={() => setIsConfirmingReset(true)}
						onShuffleToggle={onShuffleToggle}
					/>
				}
			>
				<FlashcardModeMenu missedCount={missedCount} mode={mode} onModeChange={onModeChange} />
				<WorkspaceToolbarTextButton
					aria-pressed={shuffled}
					className={cn(shuffled && "bg-accent text-foreground")}
					onClick={onShuffleToggle}
				>
					<Shuffle />
					Shuffle
				</WorkspaceToolbarTextButton>
				<WorkspaceToolbarIconButton
					aria-label="Reset flashcard progress"
					title="Reset progress"
					disabled={!canReset || isResetting}
					onClick={() => setIsConfirmingReset(true)}
				>
					{isResetting ? <LoaderCircle className="animate-spin" /> : <RotateCcw />}
				</WorkspaceToolbarIconButton>
			</WorkspaceResponsiveToolbar>
			<AlertDialog open={isConfirmingReset} onOpenChange={setIsConfirmingReset}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Reset flashcard progress?</AlertDialogTitle>
						<AlertDialogDescription>
							This clears every saved response for this set. The cards themselves will not change.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={isResetting}>Keep progress</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							disabled={isResetting}
							onClick={() => {
								setIsConfirmingReset(false);
								onReset();
							}}
						>
							Reset progress
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}

function FlashcardModeMenu({
	missedCount,
	mode,
	onModeChange,
}: {
	missedCount: number;
	mode: FlashcardStudyMode;
	onModeChange: (mode: FlashcardStudyMode) => void;
}) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger render={<WorkspaceToolbarTextButton />}>
				{mode === "all" ? <List /> : <XCircle />}
				{mode === "all" ? "All cards" : "Missed"}
			</DropdownMenuTrigger>
			<DropdownMenuContent className="w-48" align="end">
				<FlashcardModeItems missedCount={missedCount} mode={mode} onModeChange={onModeChange} />
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function FlashcardActionsMenuContent({
	canReset,
	isResetting,
	missedCount,
	mode,
	shuffled,
	onModeChange,
	onReset,
	onShuffleToggle,
}: {
	canReset: boolean;
	isResetting: boolean;
	missedCount: number;
	mode: FlashcardStudyMode;
	shuffled: boolean;
	onModeChange: (mode: FlashcardStudyMode) => void;
	onReset: () => void;
	onShuffleToggle: () => void;
}) {
	return (
		<>
			<FlashcardModeItems missedCount={missedCount} mode={mode} onModeChange={onModeChange} />
			<DropdownMenuSeparator />
			<DropdownMenuGroup>
				<DropdownMenuItem onClick={onShuffleToggle}>
					<Shuffle />
					Shuffle
					{shuffled ? <span className="ml-auto text-xs text-muted-foreground">On</span> : null}
				</DropdownMenuItem>
				<DropdownMenuItem disabled={!canReset || isResetting} onClick={onReset}>
					{isResetting ? <LoaderCircle className="animate-spin" /> : <RotateCcw />}
					Reset progress…
				</DropdownMenuItem>
			</DropdownMenuGroup>
		</>
	);
}

function FlashcardModeItems({
	missedCount,
	mode,
	onModeChange,
}: {
	missedCount: number;
	mode: FlashcardStudyMode;
	onModeChange: (mode: FlashcardStudyMode) => void;
}) {
	return (
		<DropdownMenuGroup>
			<DropdownMenuRadioGroup
				value={mode}
				onValueChange={(value) => {
					if (value === "all" || value === "missed") onModeChange(value);
				}}
			>
				<DropdownMenuRadioItem value="all">
					<List />
					All cards
				</DropdownMenuRadioItem>
				<DropdownMenuRadioItem value="missed" disabled={missedCount === 0}>
					<XCircle />
					Missed
				</DropdownMenuRadioItem>
			</DropdownMenuRadioGroup>
		</DropdownMenuGroup>
	);
}
