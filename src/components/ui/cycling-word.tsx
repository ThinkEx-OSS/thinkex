import { useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";

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
	/** Index of the cursor; equals word length once fully resolved. */
	head: number;
	/** Per-character logo colors for the current word. */
	colors: string[];
	/** True briefly after the word resolves, to show a trailing cursor. */
	endCursor: boolean;
}

/**
 * Drives a left-to-right reveal of `target`: advances a cursor one character at
 * a time and exposes its position + per-char colors so the component can render
 * resolved letters, the cursor, and un-revealed colored letters. Once resolved
 * it flags a brief trailing cursor. Frame-driven via rAF; resolves instantly
 * while `active` is false (reduced motion).
 */
function useSweep(target: string, active: boolean): SweepState {
	const [head, setHead] = useState(target.length);
	const [endCursor, setEndCursor] = useState(false);
	const colorsRef = useRef<string[]>(paletteFor(target.length));
	const rafRef = useRef<number | null>(null);

	useEffect(() => {
		colorsRef.current = paletteFor(target.length);
		setEndCursor(false);

		if (!active) {
			setHead(target.length);
			return;
		}

		const length = target.length;
		let frame = 0;
		setHead(0);

		const tickFrame = () => {
			const next = Math.floor(frame / FRAMES_PER_CHAR);
			setHead(Math.min(next, length));
			if (next >= length) {
				// Show the cursor solid for one frame, then start the fade.
				setEndCursor(true);
				rafRef.current = requestAnimationFrame(() => setEndCursor(false));
				return;
			}
			frame++;
			rafRef.current = requestAnimationFrame(tickFrame);
		};
		tickFrame();

		return () => {
			if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
		};
	}, [target, active]);

	return { head, colors: colorsRef.current, endCursor };
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

	const [index, setIndex] = useState(0);
	// Brief horizontal nudge fired on each advance (auto or click).
	const [pulse, setPulse] = useState(false);
	const pulseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

	const advance = useCallback(() => {
		setIndex((i) => (i + 1) % words.length);
		setPulse(true);
		if (pulseTimer.current) clearTimeout(pulseTimer.current);
		pulseTimer.current = setTimeout(() => setPulse(false), 130);
	}, [words.length]);

	// (Re)start the auto-cycle; called on mount and after each manual advance
	// so a click resets the countdown rather than letting it fire right after.
	const restartTimer = useCallback(() => {
		if (intervalRef.current) clearInterval(intervalRef.current);
		if (!animate) return;
		intervalRef.current = setInterval(advance, CYCLE_MS);
	}, [advance, animate]);

	useEffect(() => {
		restartTimer();
		return () => {
			if (intervalRef.current) clearInterval(intervalRef.current);
			if (pulseTimer.current) clearTimeout(pulseTimer.current);
		};
	}, [restartTimer]);

	const handleClick = useCallback(() => {
		advance();
		restartTimer();
	}, [advance, restartTimer]);

	const word = words[index];
	const { head, colors, endCursor } = useSweep(word, animate);
	const longest = words.reduce((a, b) => (b.length > a.length ? b : a), "");
	const letters = [...word];

	return (
		<button
			type="button"
			onClick={handleClick}
			title="Cycle word"
			className={cn(
				"relative inline-block cursor-pointer rounded-sm text-left align-baseline outline-none",
				"transition-transform duration-150 ease-out",
				pulse && "-translate-x-[3px]",
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
				{letters.map((ch, i) => {
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
						<span key={i} style={{ color }}>
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
