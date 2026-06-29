import { Loader2 } from "lucide-react";
import { type FormEvent, useEffect, useId, useState } from "react";
import { toast } from "sonner";
import type { Survey } from "posthog-js";

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
import {
	captureFeedbackSurveySent,
	captureFeedbackSurveyShown,
	getFeedbackOpenQuestions,
	type FeedbackOpenQuestion,
	loadFeedbackSurvey,
} from "#/integrations/posthog/feedback-survey";
import { getErrorMessage } from "#/lib/error-message";

const feedbackDialogTitle = "Feedback";
const feedbackDialogDescription = "We read every note!";
const feedbackQuestionLabel = "How can we improve ThinkEx?";
const feedbackPlaceholder = "Share what is confusing, missing, slow, or not working well...";

interface FeedbackDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

function getInitialResponses(questions: FeedbackOpenQuestion[]) {
	return Object.fromEntries(questions.map((question) => [question.id, ""]));
}

function FeedbackDialogForm({
	survey,
	onOpenChange,
}: {
	survey: Survey;
	onOpenChange: (open: boolean) => void;
}) {
	const formId = useId();
	const openQuestions = getFeedbackOpenQuestions(survey);
	const [responses, setResponses] = useState(() => getInitialResponses(openQuestions));
	const [isSubmitting, setIsSubmitting] = useState(false);

	useEffect(() => {
		captureFeedbackSurveyShown(survey.id);
	}, [survey.id]);

	const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();

		const hasEmptyRequired = openQuestions.some(
			(question) => !question.optional && responses[question.id]?.trim().length === 0,
		);

		if (hasEmptyRequired) {
			toast.error("Please answer all required questions.");
			return;
		}

		setIsSubmitting(true);

		try {
			captureFeedbackSurveySent(survey, responses);
			toast.success("Thanks for your feedback.");
			setResponses(getInitialResponses(openQuestions));
			onOpenChange(false);
		} catch {
			toast.error("Unable to send feedback right now.");
		} finally {
			setIsSubmitting(false);
		}
	};

	const submitLabel = openQuestions[0]?.buttonText ?? "Submit feedback";

	return (
		<>
			<form id={formId} className="space-y-6" onSubmit={handleSubmit}>
				<FieldGroup>
					{openQuestions.map((question) => (
						<Field key={question.id}>
							<FieldLabel htmlFor={`${formId}-${question.id}`}>
								{feedbackQuestionLabel}
								{question.optional ? (
									<span className="font-normal text-muted-foreground"> (optional)</span>
								) : null}
							</FieldLabel>
							<Textarea
								id={`${formId}-${question.id}`}
								name={question.id}
								value={responses[question.id] ?? ""}
								placeholder={feedbackPlaceholder}
								rows={4}
								required={!question.optional}
								onChange={(event) => {
									const value = event.target.value;
									setResponses((current) => ({
										...current,
										[question.id]: value,
									}));
								}}
							/>
						</Field>
					))}
				</FieldGroup>
			</form>

			<DialogFooter>
				<Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
					Cancel
				</Button>
				<Button type="submit" form={formId} disabled={isSubmitting}>
					{isSubmitting ? (
						<>
							<Loader2 className="size-4 animate-spin" />
							Sending...
						</>
					) : (
						submitLabel
					)}
				</Button>
			</DialogFooter>
		</>
	);
}

function FeedbackDialogContent({ onOpenChange }: Pick<FeedbackDialogProps, "onOpenChange">) {
	const [survey, setSurvey] = useState<Survey | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [loadError, setLoadError] = useState<string | null>(null);

	useEffect(() => {
		let isCurrent = true;

		void loadFeedbackSurvey()
			.then((loadedSurvey) => {
				if (!isCurrent) {
					return;
				}

				setSurvey(loadedSurvey);
			})
			.catch((error: unknown) => {
				if (!isCurrent) {
					return;
				}

				const message = getErrorMessage(error, "Unable to load feedback form right now.");
				setLoadError(message);
				toast.error(message);
			})
			.finally(() => {
				if (!isCurrent) {
					return;
				}

				setIsLoading(false);
			});

		return () => {
			isCurrent = false;
		};
	}, []);

	return (
		<DialogContent className="sm:max-w-lg">
			<DialogHeader>
				<DialogTitle>{feedbackDialogTitle}</DialogTitle>
				<DialogDescription>{feedbackDialogDescription}</DialogDescription>
			</DialogHeader>

			{isLoading ? (
				<div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
					<Loader2 className="size-4 animate-spin" />
					Loading feedback form...
				</div>
			) : null}

			{!isLoading && loadError ? (
				<p className="text-sm text-muted-foreground">{loadError}</p>
			) : null}

			{!isLoading && !loadError && survey ? (
				<FeedbackDialogForm key={survey.id} survey={survey} onOpenChange={onOpenChange} />
			) : null}
		</DialogContent>
	);
}

export default function FeedbackDialog({ open, onOpenChange }: FeedbackDialogProps) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			{open ? <FeedbackDialogContent onOpenChange={onOpenChange} /> : null}
		</Dialog>
	);
}
