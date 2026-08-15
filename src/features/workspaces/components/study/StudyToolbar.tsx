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
import { cn } from "#/lib/utils";

export type StudyMode = "all" | "missed";

/** The per-type copy on an otherwise identical study toolbar. */
export interface StudyToolbarLabels {
	allLabel: string;
	mobileLabel: string;
	resetAriaLabel: string;
	resetDescription: string;
	resetTitle: string;
}

export function StudyToolbar({
	canReset,
	isResetting,
	labels,
	missedCount,
	mode,
	shuffled,
	onModeChange,
	onReset,
	onShuffleToggle,
}: {
	canReset: boolean;
	isResetting: boolean;
	labels: StudyToolbarLabels;
	missedCount: number;
	mode: StudyMode;
	shuffled: boolean;
	onModeChange: (mode: StudyMode) => void;
	onReset: () => void;
	onShuffleToggle: () => void;
}) {
	const [isConfirmingReset, setIsConfirmingReset] = useState(false);
	return (
		<>
			<WorkspaceResponsiveToolbar
				mobileLabel={labels.mobileLabel}
				scrollable
				mobileContent={
					<>
						<StudyModeItems
							allLabel={labels.allLabel}
							missedCount={missedCount}
							mode={mode}
							onModeChange={onModeChange}
						/>
						<DropdownMenuSeparator />
						<DropdownMenuGroup>
							<DropdownMenuItem onClick={onShuffleToggle}>
								<Shuffle />
								Shuffle
								{shuffled ? (
									<span className="ml-auto text-xs text-muted-foreground">On</span>
								) : null}
							</DropdownMenuItem>
							<DropdownMenuItem
								disabled={!canReset || isResetting}
								onClick={() => setIsConfirmingReset(true)}
							>
								{isResetting ? <LoaderCircle className="animate-spin" /> : <RotateCcw />}
								Reset progress…
							</DropdownMenuItem>
						</DropdownMenuGroup>
					</>
				}
			>
				<DropdownMenu>
					<DropdownMenuTrigger render={<WorkspaceToolbarTextButton />}>
						{mode === "all" ? <List /> : <XCircle />}
						{mode === "all" ? labels.allLabel : "Missed"}
					</DropdownMenuTrigger>
					<DropdownMenuContent className="w-48" align="end">
						<StudyModeItems
							allLabel={labels.allLabel}
							missedCount={missedCount}
							mode={mode}
							onModeChange={onModeChange}
						/>
					</DropdownMenuContent>
				</DropdownMenu>
				<WorkspaceToolbarTextButton
					aria-pressed={shuffled}
					className={cn(shuffled && "bg-accent text-foreground")}
					onClick={onShuffleToggle}
				>
					<Shuffle />
					Shuffle
				</WorkspaceToolbarTextButton>
				<WorkspaceToolbarIconButton
					aria-label={labels.resetAriaLabel}
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
						<AlertDialogTitle>{labels.resetTitle}</AlertDialogTitle>
						<AlertDialogDescription>{labels.resetDescription}</AlertDialogDescription>
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

function StudyModeItems({
	allLabel,
	missedCount,
	mode,
	onModeChange,
}: {
	allLabel: string;
	missedCount: number;
	mode: StudyMode;
	onModeChange: (mode: StudyMode) => void;
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
					{allLabel}
				</DropdownMenuRadioItem>
				<DropdownMenuRadioItem value="missed" disabled={missedCount === 0}>
					<XCircle />
					Missed
				</DropdownMenuRadioItem>
			</DropdownMenuRadioGroup>
		</DropdownMenuGroup>
	);
}
