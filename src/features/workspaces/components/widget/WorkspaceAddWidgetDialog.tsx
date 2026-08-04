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
import { stageComposerPrompt } from "#/features/workspaces/composer/workspace-composer-actions";

/**
 * Adding a widget is an AI-authoring kickoff, not a blank block. Rather than
 * insert an empty widget the user would have to fill in by hand, we collect a
 * description and hand it to the AI by prefilling the composer (via the shared
 * `stageComposerPrompt` primitive). The AI writes the widget into the document.
 *
 * The prompt names the document by path because it is staged, not sent: the
 * user may switch views before sending, which would leave "this document"
 * pointing somewhere else.
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
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			{open ? (
				<WorkspaceAddWidgetDialogContent
					documentPath={documentPath}
					workspaceId={workspaceId}
					onOpenChange={onOpenChange}
				/>
			) : null}
		</Dialog>
	);
}

function WorkspaceAddWidgetDialogContent({
	documentPath,
	workspaceId,
	onOpenChange,
}: {
	documentPath: string;
	workspaceId: string;
	onOpenChange: (open: boolean) => void;
}) {
	const descriptionId = useId();

	return (
		<DialogContent>
			<form
				className="grid gap-6"
				action={(formData) => {
					const raw = formData.get("description");
					const description = (typeof raw === "string" ? raw : "").trim();

					if (!description) {
						return;
					}

					stageComposerPrompt(
						workspaceId,
						`Add an interactive widget to ${documentPath}: ${description}`,
					);
					onOpenChange(false);
				}}
			>
				<DialogHeader>
					<DialogTitle>Add a widget</DialogTitle>
					<DialogDescription>
						A widget is an interactive tool that lives in this document, such as a simulation,
						calculator, diagram, or visualization. Describe what you want, and the AI will build it
						for you.
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
							placeholder="e.g. An interactive unit circle that shows sine and cosine as I drag the angle"
						/>
					</Field>
				</FieldGroup>
				<DialogFooter>
					<Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button type="submit">Add with AI</Button>
				</DialogFooter>
			</form>
		</DialogContent>
	);
}
