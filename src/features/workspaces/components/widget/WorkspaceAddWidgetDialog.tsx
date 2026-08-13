import { useId } from "react";

import { Button } from "#/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "#/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "#/components/ui/field";
import { Textarea } from "#/components/ui/textarea";
import { sendComposerPrompt } from "#/features/workspaces/composer/workspace-composer-actions";

/**
 * Adding a widget is an AI-authoring kickoff, not a blank block. Rather than
 * insert an empty widget the user would have to fill in by hand, we collect a
 * description and send one explicit request in the current AI thread.
 */
export function WorkspaceAddWidgetDialog({
	documentPath,
	open,
	workspaceId,
	onOpenChange,
}: {
	documentPath: string;
	open: boolean;
	workspaceId: string;
	onOpenChange: (open: boolean) => void;
}) {
	const descriptionId = useId();

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			{open ? (
				<DialogContent>
					<form
						className="grid gap-6"
						action={(formData) => {
							const raw = formData.get("description");
							const description = (typeof raw === "string" ? raw : "").trim();

							if (!description) {
								return;
							}

							if (
								!sendComposerPrompt(
									workspaceId,
									`Add an interactive widget to ${documentPath}: ${description}`,
								)
							)
								return;
							onOpenChange(false);
						}}
					>
						<DialogHeader>
							<DialogTitle>Add a widget</DialogTitle>
							<DialogDescription>
								Describe the interactive tool you want in this document.
							</DialogDescription>
						</DialogHeader>
						<FieldGroup>
							<Field>
								<FieldLabel htmlFor={descriptionId}>What should it do?</FieldLabel>
								<Textarea
									id={descriptionId}
									name="description"
									rows={4}
									required
									autoFocus
									placeholder="A calculator, interactive diagram, or simulation"
								/>
								<p className="text-xs text-muted-foreground">
									This sends in your current chat and builds the widget automatically.
								</p>
							</Field>
						</FieldGroup>
						<DialogFooter>
							<Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
								Cancel
							</Button>
							<Button type="submit">Build with AI</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			) : null}
		</Dialog>
	);
}
