import { Layers3, ListChecks } from "lucide-react";
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

export type StudyItemDialogType = "flashcard" | "quiz";

const studyItemDialogConfigs = {
	flashcard: {
		Icon: Layers3,
		iconClassName: "text-violet-500",
		title: "Create flashcards",
		countLabel: "Number of cards",
		prompt: (count: number, locationPhrase: string, topic: string) =>
			`Create a flashcard set with exactly ${count} cards ${locationPhrase}. Cover: ${topic}`,
	},
	quiz: {
		Icon: ListChecks,
		iconClassName: "text-emerald-500",
		title: "Create a quiz",
		countLabel: "Number of questions",
		prompt: (count: number, locationPhrase: string, topic: string) =>
			`Create a quiz with exactly ${count} multiple-choice questions ${locationPhrase}. Cover: ${topic}`,
	},
} as const satisfies Record<StudyItemDialogType, unknown>;

/** Collects a topic and size, then hands the AI composer the create request. */
export function CreateStudyItemDialog({
	type,
	open,
	parentPath,
	workspaceId,
	onOpenChange,
}: {
	type: StudyItemDialogType;
	open: boolean;
	parentPath: string;
	workspaceId: string;
	onOpenChange: (open: boolean) => void;
}) {
	const topicId = useId();
	const countId = useId();
	const config = studyItemDialogConfigs[type];

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
									config.prompt(count, describeStudyItemLocation(parentPath), topic),
								)
							)
								return;
							onOpenChange(false);
						}}
					>
						<DialogHeader>
							<DialogTitle className="flex items-center gap-2">
								<config.Icon className={`size-5 ${config.iconClassName}`} aria-hidden="true" />
								{config.title}
							</DialogTitle>
							<DialogDescription>AI will create it in your current chat.</DialogDescription>
						</DialogHeader>
						<FieldGroup>
							<Field>
								<FieldLabel htmlFor={topicId}>What should it cover?</FieldLabel>
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
								<FieldLabel htmlFor={countId}>{config.countLabel}</FieldLabel>
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

function describeStudyItemLocation(parentPath: string) {
	if (parentPath === "/") return "in this workspace";
	return `in the “${parentPath.slice(1).replaceAll("/", " › ")}” folder`;
}
