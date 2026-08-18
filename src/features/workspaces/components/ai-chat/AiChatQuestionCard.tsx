import { LazyMotion, domAnimation, m } from "motion/react";
import { MessageCircleQuestionMark } from "lucide-react";
import { useRef, useState } from "react";

import { InputGroup, InputGroupAddon } from "#/components/ui/input-group";
import {
	Questionnaire,
	QuestionnaireChoice,
	QuestionnaireChoiceDescription,
	QuestionnaireChoices,
	QuestionnaireInput,
	QuestionnaireItem,
	QuestionnaireNext,
	QuestionnairePrevious,
	QuestionnaireProgress,
	QuestionnaireSkip,
	QuestionnaireSubmit,
	QuestionnaireTitle,
} from "#/components/ui/questionnaire";
import {
	aiChatComposerFooterPadding,
	aiChatComposerGroupClassName,
	aiChatComposerInlinePadding,
} from "#/features/workspaces/components/ai-chat/ai-chat-layout";
import type {
	AiChatQuestion,
	AiChatQuestionAnswer,
} from "#/features/workspaces/components/ai-chat/ai-chat-question";
import { useTypeToFocusTextInput } from "#/hooks/use-type-to-focus-text-input";
import { cn } from "#/lib/utils";

/**
 * The pending question, wearing the composer's own shell so it reads as the
 * composer changing its contents rather than a card appearing over it. One
 * question per step; the model may ask up to four, so the shadcn primitive's
 * stepper earns its keep even though the common case is a single screen.
 *
 * Answers are read from component state rather than the form's native
 * serialization: the free-text input shares its question's field name, so a
 * FormData read cannot tell a typed answer from a chosen label.
 */
export default function AiChatQuestionCard({
	disabled,
	questions,
	onAnswer,
}: {
	disabled: boolean;
	questions: AiChatQuestion[];
	onAnswer: (answers: AiChatQuestionAnswer[]) => void;
}) {
	const [selections, setSelections] = useState<Record<string, string[]>>({});
	const [customText, setCustomText] = useState<Record<string, string>>({});
	// Owning the active step is what lets Skip and type-to-focus know which
	// question they are acting on without reading it back off the DOM.
	const [activeItem, setActiveItem] = useState(() => questionFieldName(0));
	const activeInputRef = useRef<HTMLInputElement | null>(null);

	// Choices belong here as well as in the markup — the root tracks answered
	// vs unanswered state from this list, not from what happens to be rendered.
	const items = questions.map((question, index) => ({
		name: questionFieldName(index),
		choices: question.options.map((option) => ({ value: option.label })),
		// Never `required`: the stepper would block Next on an unanswered
		// question, and Skip is meant to always be one click away.
		required: false,
	}));

	const chooseOption = (name: string, value: string, multiple: boolean) => {
		// A single-select pick supersedes anything typed; multi-select keeps both.
		if (!multiple) {
			setCustomText((current) => ({ ...current, [name]: "" }));
		}
		setSelections((current) => {
			const chosen = current[name] ?? [];

			if (!multiple) {
				return { ...current, [name]: [value] };
			}

			return {
				...current,
				[name]: chosen.includes(value)
					? chosen.filter((entry) => entry !== value)
					: [...chosen, value],
			};
		});
	};

	const writeCustom = (name: string, value: string, multiple: boolean) => {
		// Mirror image of the above: typing an answer to a single-select question
		// clears the radio, so the two can never both claim to be the answer.
		if (!multiple && value.trim()) {
			setSelections((current) => ({ ...current, [name]: [] }));
		}
		setCustomText((current) => ({ ...current, [name]: value }));
	};

	const collectAnswers = (): AiChatQuestionAnswer[] =>
		questions.map((question, index) => {
			const name = questionFieldName(index);
			const custom = customText[name]?.trim() ?? "";
			const values = [...(selections[name] ?? []), ...(custom ? [custom] : [])];

			// Skipping clears the question's answer, so "nothing chosen" is the
			// only representation of a skip — no separate flag to keep in step.
			return {
				header: question.header,
				question: question.question,
				values,
				skipped: values.length === 0,
			};
		});

	const isMultiQuestion = questions.length > 1;

	// Typing anywhere lands in the active question's free-text field, exactly as
	// it does in the composer. Digits are left alone — the root binds them to
	// choice selection.
	useTypeToFocusTextInput({
		enabled: !disabled,
		ignoreKey: isDigit,
		inputRef: activeInputRef,
		setValue: (value) =>
			setCustomText((current) => ({
				...current,
				[activeItem]: typeof value === "function" ? value(current[activeItem] ?? "") : value,
			})),
	});

	return (
		<LazyMotion features={domAnimation}>
			<m.div
				initial={{ opacity: 0, y: 8 }}
				animate={{ opacity: 1, y: 0 }}
				// Matches AiChatComposerReveal, so the question arriving feels like
				// the composer's other rows rather than a separate widget.
				transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
			>
				<Questionnaire
					items={items}
					item={activeItem}
					onItemChange={setActiveItem}
					// The root's keydown owns these: a number key selects, Cmd/Ctrl+Enter
					// submits, arrows move between choices and questions. It ignores keys
					// aimed at a text field, so the free-text input below is unaffected.
					shortcuts="numbers"
					onSubmit={(event) => {
						event.preventDefault();
						if (!disabled) {
							onAnswer(collectAnswers());
						}
					}}
				>
					<InputGroup className={aiChatComposerGroupClassName}>
						<div className={cn("w-full min-w-0 pt-3 pb-1", aiChatComposerInlinePadding)}>
							{questions.map((question, index) => {
								const name = questionFieldName(index);
								const chosen = selections[name] ?? [];

								return (
									<QuestionnaireItem key={name} name={name} multiple={question.multiple}>
										{/* The label lives INSIDE the title: the title renders a
								    <legend>, which always paints at the top of its <fieldset>
								    regardless of DOM order, so a sibling above it lands below. */}
										<QuestionnaireTitle>
											<span className="flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
												<MessageCircleQuestionMark className="size-3 shrink-0" aria-hidden="true" />
												<span className="min-w-0 truncate">{question.header}</span>
											</span>
											{question.question}
										</QuestionnaireTitle>
										<QuestionnaireChoices>
											{question.options.map((option) => (
												<QuestionnaireChoice
													key={option.label}
													value={option.label}
													checked={chosen.includes(option.label)}
													onChange={() => chooseOption(name, option.label, question.multiple)}
												>
													{option.label}
													{option.description ? (
														<QuestionnaireChoiceDescription className="text-xs">
															{option.description}
														</QuestionnaireChoiceDescription>
													) : null}
												</QuestionnaireChoice>
											))}
											{/* Always visible, per the shadcn pattern — the free-text answer
									    is the escape hatch, so the model never writes an "Other". */}
											<QuestionnaireInput
												ref={name === activeItem ? activeInputRef : undefined}
												aria-label="Answer in your own words"
												placeholder="Or type your own answer…"
												value={customText[name] ?? ""}
												onChange={(event) =>
													writeCustom(name, event.target.value, question.multiple)
												}
											/>
										</QuestionnaireChoices>
									</QuestionnaireItem>
								);
							})}
						</div>

						<InputGroupAddon align="block-end" className={aiChatComposerFooterPadding}>
							<div className="flex w-full items-center gap-1">
								{isMultiQuestion ? <QuestionnaireProgress className="ps-1.5" /> : null}
								<div className="ml-auto flex items-center gap-1">
									{isMultiQuestion ? <QuestionnairePrevious variant="ghost" /> : null}
									<QuestionnaireSkip
										variant="ghost"
										onClick={() => {
											setSelections((current) => ({ ...current, [activeItem]: [] }));
											setCustomText((current) => ({ ...current, [activeItem]: "" }));
										}}
									>
										Skip
									</QuestionnaireSkip>
									<QuestionnaireNext />
									<QuestionnaireSubmit disabled={disabled}>Send</QuestionnaireSubmit>
								</div>
							</div>
						</InputGroupAddon>
					</InputGroup>
				</Questionnaire>
			</m.div>
		</LazyMotion>
	);
}

function questionFieldName(index: number) {
	return `question-${index}`;
}

// Left to the questionnaire root, which binds 1-9 to choice selection.
function isDigit(key: string) {
	return key.length === 1 && key >= "0" && key <= "9";
}
