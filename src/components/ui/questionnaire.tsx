"use client";

import * as React from "react";
import { CheckIcon } from "lucide-react";
import { Questionnaire as QuestionnairePrimitive } from "@shadcn/react/questionnaire";

import { cn } from "#/lib/utils";
import { buttonVariants, type Button } from "#/components/ui/button";

function Questionnaire({
	className,
	...props
}: React.ComponentProps<typeof QuestionnairePrimitive.Root>) {
	return (
		<QuestionnairePrimitive.Root
			data-slot="questionnaire"
			className={cn("flex w-full min-w-0 flex-col gap-0", className)}
			{...props}
		/>
	);
}

function QuestionnaireProgress({
	className,
	...props
}: React.ComponentProps<typeof QuestionnairePrimitive.Progress>) {
	return (
		<QuestionnairePrimitive.Progress
			data-slot="questionnaire-progress"
			className={cn(
				"min-h-[1lh] w-fit min-w-[14ch] text-xs font-medium text-muted-foreground tabular-nums",
				className,
			)}
			{...props}
		/>
	);
}

function QuestionnaireItem({
	className,
	...props
}: React.ComponentProps<typeof QuestionnairePrimitive.Item>) {
	return (
		<QuestionnairePrimitive.Item
			data-slot="questionnaire-item"
			className={cn("flex min-w-0 flex-col gap-5 border-0 p-0 outline-none", className)}
			{...props}
		/>
	);
}

function QuestionnaireTitle({
	className,
	...props
}: React.ComponentProps<typeof QuestionnairePrimitive.Title>) {
	return (
		<QuestionnairePrimitive.Title
			data-slot="questionnaire-title"
			className={cn(
				// Composer scale, not page-heading scale. The column layout is for
				// the question's short label sitting above its text.
				"mb-3 flex flex-col gap-1.5 text-sm font-medium text-pretty",
				className,
			)}
			{...props}
		/>
	);
}

function QuestionnaireDescription({
	className,
	...props
}: React.ComponentProps<typeof QuestionnairePrimitive.Description>) {
	return (
		<QuestionnairePrimitive.Description
			data-slot="questionnaire-description"
			className={cn("text-sm text-pretty text-muted-foreground", className)}
			{...props}
		/>
	);
}

function QuestionnaireChoices({
	className,
	...props
}: React.ComponentProps<typeof QuestionnairePrimitive.Choices>) {
	return (
		<QuestionnairePrimitive.Choices
			data-slot="questionnaire-choices"
			className={cn("group/questionnaire-choices grid min-w-0 gap-1.5", className)}
			{...props}
		/>
	);
}

function QuestionnaireChoice({
	children,
	className,
	...props
}: React.ComponentProps<typeof QuestionnairePrimitive.Choice>) {
	return (
		<QuestionnairePrimitive.Choice
			data-slot="questionnaire-choice"
			className={cn(
				// Hover carries an explicit dark counterpart: hover:bg-* and dark:bg-*
				// tie on specificity, so a lone light-mode hover is cancelled out in
				// dark mode and the row reads as inert.
				"group/questionnaire-choice relative flex cursor-pointer items-start gap-3 rounded-md border border-border/60 bg-background/40 px-3 py-2 text-start text-sm transition-colors outline-none select-none hover:border-border hover:bg-accent has-[>input:focus-visible]:border-ring has-[>input:focus-visible]:ring-3 has-[>input:focus-visible]:ring-ring/50 data-invalid:border-destructive dark:bg-background/25 dark:hover:bg-accent/60 data-checked:border-primary/40 data-checked:bg-muted dark:data-checked:bg-muted",
				"data-disabled:pointer-events-none data-disabled:cursor-not-allowed data-disabled:opacity-50",
				className,
			)}
			{...props}
		>
			<QuestionnairePrimitive.ChoiceInput
				data-slot="questionnaire-choice-input"
				className="absolute inset-0 z-10 size-full cursor-pointer opacity-0"
			/>
			<span
				aria-hidden="true"
				data-slot="questionnaire-choice-indicator"
				className="pointer-events-none relative flex size-4 shrink-0 translate-y-[--spacing(0.45)] items-center justify-center rounded-[4px] border border-input group-has-data-[slot=questionnaire-choice-description]/questionnaire-choice:translate-y-0.5 group-data-[type=radio]/questionnaire-choice:rounded-full group-data-checked/questionnaire-choice:border-primary group-data-checked/questionnaire-choice:bg-primary group-data-checked/questionnaire-choice:text-primary-foreground dark:bg-input/30 dark:group-data-checked/questionnaire-choice:bg-primary"
			>
				{/* The shortcut number lives in the indicator and yields to the
				    dot/tick once chosen: one slot carries "press this" before the
				    pick and "this is picked" after, instead of two competing badges. */}
				<QuestionnairePrimitive.ChoiceShortcut
					data-slot="questionnaire-choice-shortcut"
					// One compound variant, not two competing ones: show/hide split
					// across `group-data-[shortcut]:flex` and `group-data-checked:hidden`
					// ties on specificity, and the number renders under the dot.
					className="hidden font-mono text-[0.625rem] leading-none font-medium text-muted-foreground group-[[data-shortcut]:not([data-checked])]/questionnaire-choice:flex"
				/>
				<span
					data-slot="questionnaire-choice-indicator-dot"
					className="hidden size-2 rounded-full bg-primary-foreground group-data-[type=checkbox]/questionnaire-choice:hidden group-data-checked/questionnaire-choice:block"
				/>
				<CheckIcon
					data-slot="questionnaire-choice-indicator-check"
					className="hidden size-3.5 group-data-[type=radio]/questionnaire-choice:hidden group-data-checked/questionnaire-choice:block"
				/>
			</span>
			<QuestionnairePrimitive.ChoiceLabel
				data-slot="questionnaire-choice-label"
				className="flex min-w-0 flex-1 flex-col gap-1 leading-snug"
			>
				{children}
			</QuestionnairePrimitive.ChoiceLabel>
		</QuestionnairePrimitive.Choice>
	);
}

function QuestionnaireChoiceDescription({ className, ...props }: React.ComponentProps<"span">) {
	return (
		<span
			data-slot="questionnaire-choice-description"
			className={cn("text-muted-foreground", className)}
			{...props}
		/>
	);
}

function QuestionnaireInput({
	className,
	...props
}: React.ComponentProps<typeof QuestionnairePrimitive.Input>) {
	return (
		<div
			data-slot="questionnaire-input-wrapper"
			className="group/questionnaire-input relative w-full min-w-0"
		>
			<QuestionnairePrimitive.Input
				data-slot="questionnaire-input"
				className={cn(
					"h-9 w-full min-w-0 rounded-md border border-border/60 bg-background/40 px-3 py-1 text-base transition-[color,box-shadow,background-color] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-background/25 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
					"selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground",
					className,
				)}
				{...props}
			/>
		</div>
	);
}

function QuestionnaireError({
	className,
	...props
}: React.ComponentProps<typeof QuestionnairePrimitive.Error>) {
	return (
		<QuestionnairePrimitive.Error
			data-slot="questionnaire-error"
			className={cn("text-sm text-destructive", className)}
			{...props}
		/>
	);
}

function QuestionnairePrevious({
	children,
	className,
	size = "default",
	variant = "outline",
	...props
}: React.ComponentProps<typeof QuestionnairePrimitive.Previous> &
	Pick<React.ComponentProps<typeof Button>, "size" | "variant">) {
	return (
		<QuestionnairePrimitive.Previous
			data-slot="questionnaire-previous"
			data-size={size}
			data-variant={variant}
			className={cn(buttonVariants({ size, variant }), "min-h-11 sm:min-h-0", className)}
			{...props}
		>
			{children ?? "Previous"}
		</QuestionnairePrimitive.Previous>
	);
}

function QuestionnaireSkip({
	children,
	className,
	size = "default",
	variant = "outline",
	...props
}: React.ComponentProps<typeof QuestionnairePrimitive.Skip> &
	Pick<React.ComponentProps<typeof Button>, "size" | "variant">) {
	return (
		<QuestionnairePrimitive.Skip
			data-slot="questionnaire-skip"
			data-size={size}
			data-variant={variant}
			className={cn(buttonVariants({ size, variant }), "min-h-11 sm:min-h-0", className)}
			{...props}
		>
			{children ?? "Skip"}
		</QuestionnairePrimitive.Skip>
	);
}

function QuestionnaireNext({
	children,
	className,
	size = "default",
	variant = "default",
	...props
}: React.ComponentProps<typeof QuestionnairePrimitive.Next> &
	Pick<React.ComponentProps<typeof Button>, "size" | "variant">) {
	return (
		<QuestionnairePrimitive.Next
			data-slot="questionnaire-next"
			data-size={size}
			data-variant={variant}
			className={cn(buttonVariants({ size, variant }), "min-h-11 sm:min-h-0", className)}
			{...props}
		>
			{children ?? "Next"}
		</QuestionnairePrimitive.Next>
	);
}

function QuestionnaireSubmit({
	children,
	className,
	size = "default",
	variant = "default",
	...props
}: React.ComponentProps<typeof QuestionnairePrimitive.Submit> &
	Pick<React.ComponentProps<typeof Button>, "size" | "variant">) {
	return (
		<QuestionnairePrimitive.Submit
			data-slot="questionnaire-submit"
			data-size={size}
			data-variant={variant}
			className={cn(buttonVariants({ size, variant }), "min-h-11 sm:min-h-0", className)}
			{...props}
		>
			{children ?? "Submit"}
		</QuestionnairePrimitive.Submit>
	);
}

export {
	Questionnaire,
	QuestionnaireChoice,
	QuestionnaireChoiceDescription,
	QuestionnaireChoices,
	QuestionnaireDescription,
	QuestionnaireError,
	QuestionnaireInput,
	QuestionnaireItem,
	QuestionnaireNext,
	QuestionnairePrevious,
	QuestionnaireProgress,
	QuestionnaireSkip,
	QuestionnaireSubmit,
	QuestionnaireTitle,
};
