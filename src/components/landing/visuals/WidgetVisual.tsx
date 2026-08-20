import { useMemo, useState } from "react";

import { Slider } from "#/components/ui/slider";

const X_MIN = -5;
const X_MAX = 5;
const SAMPLES = 120;
const VIEW_WIDTH = 240;
const VIEW_HEIGHT = 120;

/** Held fixed so the widget has two controls rather than three. */
const C_CONSTANT = -3;

/**
 * A widget is a small program, so this one is a real one: a parabola that
 * redraws as you move its coefficients, with the vertex and roots recomputed
 * live. A screenshot of a chart could not make the same point.
 */
export function WidgetVisual() {
	const [a, setA] = useState(1);
	const [b, setB] = useState(0);

	const samples = useMemo(() => sampleCurve(a, b), [a, b]);
	const bounds = useMemo(() => boundsFor(samples), [samples]);
	const toY = (y: number) => projectY(y, bounds);

	const roots = solveRoots(a, b);
	const vertexX = a === 0 ? null : -b / (2 * a);

	return (
		// No inner border or surface: the feature card is already the card, and a
		// second frame inside it reads as a card in a card.
		<div className="flex min-h-52 w-full flex-col justify-center gap-3">
			<div className="w-full">
				{/* The box has to match the viewBox ratio. With a fixed height and a
				    fluid width they diverge, and the default preserveAspectRatio="meet"
				    then letterboxes the plot into a narrow strip in the middle. */}
				<svg
					viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
					className="block aspect-2/1 w-full"
					aria-hidden="true"
				>
					{[-4, -2, 2, 4].map((gridline) => (
						<line
							key={gridline}
							x1={projectX(gridline)}
							y1={0}
							x2={projectX(gridline)}
							y2={VIEW_HEIGHT}
							className="stroke-border/50"
							strokeWidth={0.5}
						/>
					))}
					<line
						x1={projectX(0)}
						y1={0}
						x2={projectX(0)}
						y2={VIEW_HEIGHT}
						className="stroke-border"
					/>
					<line x1={0} y1={toY(0)} x2={VIEW_WIDTH} y2={toY(0)} className="stroke-border" />
					<path
						d={buildPath(samples, bounds)}
						fill="none"
						className="stroke-blue-600"
						strokeWidth={2}
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
					{/* Only marked when actually on screen. A root at x = 40 is real, but
					    drawing it at the edge would point at a place the curve is not. */}
					{roots.filter(isWithinDomain).map((root) => (
						<circle
							key={root}
							cx={projectX(root)}
							cy={toY(0)}
							r={2.5}
							className="fill-emerald-600"
						/>
					))}
					{vertexX !== null && isWithinDomain(vertexX) ? (
						<circle
							cx={projectX(vertexX)}
							cy={toY(valueAt(vertexX, a, b))}
							r={2.5}
							className="fill-blue-600"
						/>
					) : null}
				</svg>
				<div className="mt-3 grid gap-2">
					<div className="flex items-baseline justify-between gap-2 text-xs">
						<span className="truncate font-mono text-muted-foreground">
							y = {format(a)}x² {b < 0 ? "-" : "+"} {format(Math.abs(b))}x -{" "}
							{format(Math.abs(C_CONSTANT))}
						</span>
						<span className="shrink-0 text-muted-foreground">
							{roots.length === 0 ? "no real roots" : `${roots.length} roots`}
						</span>
					</div>
					<CoefficientSlider label="a" value={a} min={-2} max={2} step={0.25} onChange={setA} />
					<CoefficientSlider label="b" value={b} min={-4} max={4} step={0.25} onChange={setB} />
				</div>
			</div>
		</div>
	);
}

function CoefficientSlider({
	label,
	max,
	min,
	onChange,
	step,
	value,
}: {
	label: string;
	max: number;
	min: number;
	onChange: (value: number) => void;
	step: number;
	value: number;
}) {
	return (
		<div className="flex items-center gap-3">
			<span className="w-3 shrink-0 font-mono text-xs text-muted-foreground">{label}</span>
			<Slider
				min={min}
				max={max}
				step={step}
				value={value}
				// Base UI reports an array for range sliders; this one has a single
				// thumb, so the first entry is the whole value.
				onValueChange={(next) => onChange(Array.isArray(next) ? next[0] : next)}
				aria-label={`Coefficient ${label}`}
			/>
			<span className="w-9 shrink-0 text-right font-mono text-xs tabular-nums">
				{value.toFixed(2)}
			</span>
		</div>
	);
}

type Bounds = { min: number; max: number };

/**
 * Real roots of ax² + bx + c, handling the two cases a quadratic formula alone
 * gets wrong here: a = 0 is reachable on the slider, where the curve is a line
 * with one root, and a zero discriminant is a single repeated root rather than
 * two coincident ones.
 */
function solveRoots(a: number, b: number): ReadonlyArray<number> {
	if (a === 0) {
		return b === 0 ? [] : [-C_CONSTANT / b];
	}

	const discriminant = b * b - 4 * a * C_CONSTANT;

	if (discriminant < 0) {
		return [];
	}

	if (discriminant === 0) {
		return [-b / (2 * a)];
	}

	const root = Math.sqrt(discriminant);
	return [(-b + root) / (2 * a), (-b - root) / (2 * a)];
}

function valueAt(x: number, a: number, b: number): number {
	return a * x * x + b * x + C_CONSTANT;
}

function isWithinDomain(x: number): boolean {
	return x >= X_MIN && x <= X_MAX;
}

function sampleCurve(a: number, b: number): ReadonlyArray<{ x: number; y: number }> {
	return Array.from({ length: SAMPLES + 1 }, (_, index) => {
		const x = X_MIN + ((X_MAX - X_MIN) * index) / SAMPLES;
		return { x, y: valueAt(x, a, b) };
	});
}

/**
 * The vertical range is derived from the curve rather than fixed, so steep
 * coefficients scale the view instead of running off the top of it. Zero is
 * always included so the x-axis stays visible for the roots to sit on.
 */
function boundsFor(samples: ReadonlyArray<{ y: number }>): Bounds {
	const values = samples.map((sample) => sample.y);
	const rawMin = Math.min(0, ...values);
	const rawMax = Math.max(0, ...values);
	const padding = Math.max((rawMax - rawMin) * 0.1, 0.5);

	return { min: rawMin - padding, max: rawMax + padding };
}

function projectX(x: number): number {
	return ((x - X_MIN) / (X_MAX - X_MIN)) * VIEW_WIDTH;
}

function projectY(y: number, bounds: Bounds): number {
	return VIEW_HEIGHT - ((y - bounds.min) / (bounds.max - bounds.min)) * VIEW_HEIGHT;
}

function buildPath(samples: ReadonlyArray<{ x: number; y: number }>, bounds: Bounds): string {
	const points = samples.map(
		(sample) => `${projectX(sample.x).toFixed(2)},${projectY(sample.y, bounds).toFixed(2)}`,
	);

	return `M ${points.join(" L ")}`;
}

function format(value: number): string {
	return Number.isInteger(value) ? String(value) : value.toFixed(2);
}
