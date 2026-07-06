import { useReducedMotion } from "motion/react";
import { useEffect, useReducer } from "react";

import { cn } from "#/lib/utils";

/** How long the auto-cycle waits between words. */
const CYCLE_MS = 2000;

/** Frames the sweep spends per character before advancing the cursor. */
const FRAMES_PER_CHAR = 4;
/** Fade-out duration (ms) of the trailing cursor once the word resolves. */
const END_CURSOR_MS = 150;
/** ThinkEx logo palette — un-revealed characters glow one of these at random. */
const LOGO_COLORS = ["#5C8BD6", "#73BF7A", "#DA4944", "#F7B53B"];

/** Random logo colors, never repeating the immediately preceding one. */
function paletteFor(length: number): string[] {
	const out: string[] = [];
	for (let i = 0; i < length; i++) {
		let c = LOGO_COLORS[Math.floor(Math.random() * LOGO_COLORS.length)];
		while (i > 0 && c === out[i - 1]) {
			c = LOGO_COLORS[Math.floor(Math.random() * LOGO_COLORS.length)];
		}
		out.push(c);
	}
	return out;
}

interface SweepState {
	/** Word this state was initialized for. */
	target: string;
	/** Index of the cursor; equals word length once fully resolved. */
	head: number;
	/** Per-character logo colors for the current word. */
	colors: string[];
	/** True briefly after the word resolves, to show a trailing cursor. */
	endCursor: boolean;
}

function createSweepState(target: string, active: boolean): SweepState {
	return {
		target,
		head: active ? 0 : target.length,
		colors: paletteFor(target.length),
		endCursor: false,
	};
}

type SweepAction =
	| { type: "reset"; target: string; active: boolean }
	| { type: "set-head"; target: string; head: number }
	| { type: "set-end-cursor"; target: string; endCursor: boolean };

function sweepReducer(state: SweepState, action: SweepAction): SweepState {
	if (action.type === "reset") {
		if (
			state.target === action.target &&
			state.head === (action.active ? 0 : action.target.length) &&
			state.endCursor === false
		) {
			return state;
		}

		return createSweepState(action.target, action.active);
	}

	if (state.target !== action.target) {
		return state;
	}

	if (action.type === "set-head") {
		return state.head === action.head ? state : { ...state, head: action.head };
	}

	return state.endCursor === action.endCursor ? state : { ...state, endCursor: action.endCursor };
}

/**
 * Drives a left-to-right reveal of `target`: advances a cursor one character at
 * a time and exposes its position + per-char colors so the component can render
 * resolved letters, the cursor, and un-revealed colored letters. Once resolved
 * it flags a brief trailing cursor. Frame-driven via rAF; resolves instantly
 * while `active` is false (reduced motion).
 */
function useSweep(target: string, active: boolean): SweepState {
	const [sweep, dispatch] = useReducer(sweepReducer, target, (initialTarget) =>
		createSweepState(initialTarget, false),
	);
	const currentSweep = sweep.target === target ? sweep : createSweepState(target, active);

	useEffect(() => {
		let rafId: number | null = null;
		let cursorRafId: number | null = null;

		if (!active) {
			dispatch({ type: "reset", target, active: false });
			return;
		}

		const length = target.length;
		let frame = 0;
		dispatch({ type: "reset", target, active: true });

		const tickFrame = () => {
			const next = Math.floor(frame / FRAMES_PER_CHAR);
			dispatch({ type: "set-head", target, head: Math.min(next, length) });
			if (next >= length) {
				// Show the cursor solid for one frame, then start the fade.
				dispatch({ type: "set-end-cursor", target, endCursor: true });
				cursorRafId = requestAnimationFrame(() => {
					dispatch({ type: "set-end-cursor", target, endCursor: false });
				});
				return;
			}
			frame++;
			rafId = requestAnimationFrame(tickFrame);
		};
		tickFrame();

		return () => {
			if (rafId !== null) cancelAnimationFrame(rafId);
			if (cursorRafId !== null) cancelAnimationFrame(cursorRafId);
		};
	}, [target, active]);

	return currentSweep;
}

interface CycleState {
	index: number;
	hasAdvanced: boolean;
	pulse: boolean;
}

type CycleAction = { type: "advance"; wordCount: number } | { type: "clear-pulse" };

function cycleReducer(state: CycleState, action: CycleAction): CycleState {
	if (action.type === "clear-pulse") {
		return state.pulse ? { ...state, pulse: false } : state;
	}

	return {
		index: (state.index + 1) % action.wordCount,
		hasAdvanced: true,
		pulse: true,
	};
}

interface CyclingWordProps {
	/** Words to rotate through, in order. */
	words: string[];
	className?: string;
}

/**
 * A single headline word that auto-cycles through `words`. Each new word
 * resolves in left-to-right: a cursor sweeps across, leaving solid letters
 * behind and revealing logo-colored letters ahead. Clicking (or focusing +
 * Enter/Space) advances to the next word immediately. Honors
 * `prefers-reduced-motion`: no sweep, no auto-cycle — the word still advances on
 * click.
 */
export function CyclingWord({ words, className }: CyclingWordProps) {
	const reduceMotion = useReducedMotion();
	const animate = !reduceMotion;

	const [cycle, advance] = useReducer(cycleReducer, {
		index: 0,
		hasAdvanced: false,
		pulse: false,
	});

	useEffect(() => {
		if (!animate) {
			return;
		}

		const intervalId = setInterval(() => {
			advance({ type: "advance", wordCount: words.length });
		}, CYCLE_MS);

		return () => clearInterval(intervalId);
	}, [animate, cycle.index, words.length]);

	useEffect(() => {
		if (!cycle.pulse) {
			return;
		}

		const pulseTimerId = setTimeout(() => advance({ type: "clear-pulse" }), 130);

		return () => clearTimeout(pulseTimerId);
	}, [cycle.pulse]);

	const handleClick = () => advance({ type: "advance", wordCount: words.length });

	const word = words[cycle.index];
	const { head, colors, endCursor } = useSweep(word, animate && cycle.hasAdvanced);
	const longest = words.reduce((a, b) => (b.length > a.length ? b : a), "");
	const letterCounts = new Map<string, number>();
	const letters = [...word].map((ch) => {
		const count = letterCounts.get(ch) ?? 0;
		letterCounts.set(ch, count + 1);

		return { ch, id: `${word}:${ch}:${count}` };
	});

	return (
		<button
			type="button"
			onClick={handleClick}
			title="Cycle word"
			className={cn(
				"relative inline-block cursor-pointer rounded-sm text-left align-baseline outline-none",
				"transition-transform duration-150 ease-out",
				cycle.pulse && "-translate-x-[3px]",
				"focus-visible:ring-2 focus-visible:ring-ring",
				className,
			)}
		>
			{/* Invisible sizer reserves the widest word so the line never reflows. */}
			<span aria-hidden className="invisible whitespace-nowrap">
				{longest}
			</span>

			{/* Live word, overlaid on the sizer, left-aligned. */}
			<span aria-hidden className="absolute inset-y-0 left-0 whitespace-nowrap">
				{letters.map(({ ch, id }, i) => {
					if (i === head) {
						// Cursor: a color block sized to the real letter (kept
						// invisible underneath) so following letters never shift.
						return (
							<span key="cursor" className="relative">
								<span className="invisible">{ch}</span>
								<span
									aria-hidden
									className="absolute inset-x-0 inset-y-[0.12em] rounded-[2px]"
									style={{ backgroundColor: colors[i] }}
								/>
							</span>
						);
					}
					// Left of the cursor: resolved letters in the normal text color.
					// Right of it: un-revealed letters glowing a logo color.
					const color = i < head ? undefined : colors[i];
					return (
						<span key={id} style={{ color }}>
							{ch}
						</span>
					);
				})}
				{/* Trailing cursor: blinks in one char past the word in text
				    color the moment it resolves, then fades out fast. */}
				{head >= letters.length && (
					<span className="relative ml-[0.12em]" aria-hidden>
						<span className="invisible">n</span>
						<span
							className={cn(
								"absolute inset-x-0 inset-y-[0.12em] rounded-[2px] bg-foreground transition-opacity",
								endCursor ? "opacity-100" : "opacity-0",
							)}
							style={{ transitionDuration: `${END_CURSOR_MS}ms` }}
						/>
					</span>
				)}
			</span>

			{/* Real word for assistive tech (the visual above is aria-hidden); it
			    is the button's accessible name so the headline reads coherently. */}
			<span className="sr-only">{word}</span>
		</button>
	);
}
