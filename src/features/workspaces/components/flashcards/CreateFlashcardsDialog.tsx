import { Layers3 } from "lucide-react";
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
import { NativeSelect, NativeSelectOption } from "#/components/ui/native-select";
import { Textarea } from "#/components/ui/textarea";
import { sendComposerPrompt } from "#/features/workspaces/composer/workspace-composer-actions";

export function CreateFlashcardsDialog({
	open,
	parentPath,
	workspaceId,
	onOpenChange,
}: {
	open: boolean;
	parentPath: string;
	workspaceId: string;
	onOpenChange: (open: boolean) => void;
}) {
	const topicId = useId();
	const countId = useId();

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			{open ? (
				<DialogContent>
					<form
						className="grid gap-6"
						action={(formData) => {
							const rawTopic = formData.get("topic");
							const topic = typeof rawTopic === "string" ? rawTopic.trim() : "";
							const count = Number(formData.get("count"));
							if (!topic || ![5, 10, 15, 20].includes(count)) return;
							if (
								!sendComposerPrompt(
									workspaceId,
									`Create a flashcard set with exactly ${count} cards ${describeFlashcardLocation(parentPath)}. Cover: ${topic}`,
								)
							)
								return;
							onOpenChange(false);
						}}
					>
						<DialogHeader>
							<DialogTitle className="flex items-center gap-2">
								<Layers3 className="size-5 text-violet-500" aria-hidden="true" />
								Create flashcards
							</DialogTitle>
							<DialogDescription>AI will create the set in your current chat.</DialogDescription>
						</DialogHeader>
						<FieldGroup>
							<Field>
								<FieldLabel htmlFor={topicId}>What should the cards cover?</FieldLabel>
								<Textarea
									id={topicId}
									name="topic"
									rows={5}
									required
									autoFocus
									placeholder="The key ideas, source material, or topic to study"
								/>
							</Field>
							<Field orientation="horizontal" className="items-center justify-between">
								<FieldLabel htmlFor={countId}>Number of cards</FieldLabel>
								<NativeSelect id={countId} name="count" defaultValue="10" size="sm">
									<NativeSelectOption value="5">5</NativeSelectOption>
									<NativeSelectOption value="10">10</NativeSelectOption>
									<NativeSelectOption value="15">15</NativeSelectOption>
									<NativeSelectOption value="20">20</NativeSelectOption>
								</NativeSelect>
							</Field>
						</FieldGroup>
						<DialogFooter>
							<Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
								Cancel
							</Button>
							<Button type="submit">Create with AI</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			) : null}
		</Dialog>
	);
}

function describeFlashcardLocation(parentPath: string) {
	if (parentPath === "/") return "in this workspace";
	return `in the “${parentPath.slice(1).replaceAll("/", " › ")}” folder`;
}
