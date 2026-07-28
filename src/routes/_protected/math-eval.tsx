import { cjk } from "@streamdown/cjk";
import { createMathPlugin } from "@streamdown/math";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { Streamdown } from "streamdown";
import "katex/dist/katex.min.css";

import { getAIThreadSoulPrompt } from "#/features/workspaces/ai/ai-thread-soul-prompt";
import { WORKSPACE_AI_CHAT_MODELS } from "#/features/workspaces/ai/models";

export const Route = createFileRoute("/_protected/math-eval")({
	head: () => ({ meta: [{ title: "ThinkEx | Math Eval" }] }),
	component: MathEvalPage,
});

type RendererId = "current" | "double-dollar" | "normalized";

type RendererDef = {
	id: RendererId;
	label: string;
	description: string;
	plugins: Record<string, unknown>;
	transform?: (text: string) => string;
};

// Rewrites \(x\) → $x$ and \[x\] → $$x$$ at the string level. Naive: does not
// skip fenced/inline code, which is fine for a math-focused eval harness.
function normalizeLatexDelimiters(text: string): string {
	return text
		.replace(/\\\[([\s\S]+?)\\\]/g, (_, tex) => `$$${tex}$$`)
		.replace(/\\\(([\s\S]+?)\\\)/g, (_, tex) => `$${tex}$`);
}

const RENDERERS: RendererDef[] = [
	{
		id: "current",
		label: "Current (singleDollar: true)",
		description: "Prod config. $x$ inline, $$x$$ block, currency $5 breaks.",
		plugins: {
			cjk,
			math: createMathPlugin({
				errorColor: "var(--color-muted-foreground)",
				singleDollarTextMath: true,
			}),
		},
	},
	{
		id: "double-dollar",
		label: "Vercel default (singleDollar: false)",
		description: "Only $$…$$ parses as math. Currency-safe.",
		plugins: {
			cjk,
			math: createMathPlugin({
				errorColor: "var(--color-muted-foreground)",
				singleDollarTextMath: false,
			}),
		},
	},
	{
		id: "normalized",
		label: "Current + delimiter normalizer",
		description:
			"singleDollar: true, then string-rewrites \\(…\\) → $…$ and \\[…\\] → $$…$$ before render.",
		plugins: {
			cjk,
			math: createMathPlugin({
				errorColor: "var(--color-muted-foreground)",
				singleDollarTextMath: true,
			}),
		},
		transform: normalizeLatexDelimiters,
	},
];

// Natural lay-user messages — none mention "inline math", "LaTeX", "block
// math", etc. The model has to decide how to notate math from context alone.
const EVAL_PROMPTS = [
	{ id: "pythag", label: "Pythag", prompt: "quick refresher: what's the pythagorean theorem" },
	{ id: "quadratic", label: "Quadratic", prompt: "help me solve x^2 + 5x + 6 = 0 step by step" },
	{
		id: "rotation-matrix",
		label: "3D rotation",
		prompt: "how do i rotate a 3d point around the z axis by an angle theta",
	},
	{
		id: "savings",
		label: "Savings ($)",
		prompt:
			"i make $5000 a month and pay $1200 in rent, how much am i saving if my other expenses are $800",
	},
	{
		id: "path-vs-math",
		label: "$PATH + math R",
		prompt: "what does $PATH do in bash. also whats R with the double stroke mean in math",
	},
	{ id: "sum-1-to-n", label: "Sum 1..n proof", prompt: "prove that 1+2+...+n = n(n+1)/2" },
	{ id: "two-equations", label: "2 equations", prompt: "solve these for me: 2x+3y=12 and x-y=1" },
	{
		id: "schrodinger",
		label: "Schrödinger",
		prompt: "explain the schrodinger equation and what each part means",
	},
	{
		id: "pricing-pitch",
		label: "Pricing pitch",
		prompt:
			"write me a one paragraph pitch for a subscription at $9.99/month with a $0.50 setup fee",
	},
	{ id: "fractions", label: "Fractions", prompt: "why does 1/3 + 1/6 equal 1/2" },
	{ id: "euler", label: "Euler identity", prompt: "walk me through why e^(i*pi) + 1 = 0" },
	{
		id: "physics-ke",
		label: "Kinetic energy",
		prompt: "how much kinetic energy does a 2kg ball moving at 5 m/s have",
	},
	{
		id: "compound-interest",
		label: "Compound interest",
		prompt: "if i invest $10000 at 7% compounded annually, how much do i have after 20 years",
	},
	{ id: "matrix-mult", label: "2x2 matrices", prompt: "show me how to multiply two 2x2 matrices" },
	{ id: "derivative", label: "Derivative", prompt: "whats the derivative of x^3 * sin(x)" },
];

const DEFAULT_MODEL_IDS = ["claude-sonnet", "chatgpt", "gemini-pro"];

function MathEvalPage() {
	const [systemPrompt, setSystemPrompt] = useState(() => getAIThreadSoulPrompt());
	const [userPrompt, setUserPrompt] = useState(EVAL_PROMPTS[0].prompt);
	const [selectedModelIds, setSelectedModelIds] = useState<string[]>(DEFAULT_MODEL_IDS);
	const [selectedRendererIds, setSelectedRendererIds] = useState<RendererId[]>([
		"current",
		"double-dollar",
		"normalized",
	]);
	const [runId, setRunId] = useState(0);
	const [showRaw, setShowRaw] = useState(false);

	const activeRenderers = useMemo(
		() => RENDERERS.filter((r) => selectedRendererIds.includes(r.id)),
		[selectedRendererIds],
	);

	const runs = useMemo(
		() => selectedModelIds.map((id) => ({ modelId: id, runId })),
		[selectedModelIds, runId],
	);

	return (
		<div className="mx-auto flex max-w-[1600px] flex-col gap-4 p-4 text-sm">
			<header className="flex items-baseline justify-between">
				<h1 className="text-lg font-semibold">Math rendering eval</h1>
				<div className="text-xs text-muted-foreground">
					Internal — compare how models emit LaTeX and how streamdown renders it.
				</div>
			</header>

			<section className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_1fr]">
				<label className="flex flex-col gap-1">
					<span className="text-xs font-medium">System prompt</span>
					<textarea
						className="min-h-[160px] rounded border border-border bg-background p-2 font-mono text-xs"
						value={systemPrompt}
						onChange={(e) => setSystemPrompt(e.target.value)}
					/>
				</label>
				<label className="flex flex-col gap-1">
					<span className="text-xs font-medium">User prompt</span>
					<textarea
						className="min-h-[160px] rounded border border-border bg-background p-2 font-mono text-xs"
						value={userPrompt}
						onChange={(e) => setUserPrompt(e.target.value)}
					/>
					<div className="flex flex-wrap gap-1">
						{EVAL_PROMPTS.map((p) => (
							<button
								key={p.id}
								type="button"
								onClick={() => setUserPrompt(p.prompt)}
								className="rounded border border-border bg-background px-2 py-0.5 text-xs hover:bg-muted"
							>
								{p.label}
							</button>
						))}
					</div>
				</label>
			</section>

			<section className="flex flex-wrap gap-4">
				<fieldset className="flex flex-col gap-1">
					<legend className="text-xs font-medium">Models</legend>
					<div className="flex flex-wrap gap-2">
						{WORKSPACE_AI_CHAT_MODELS.map((m) => (
							<label key={m.id} className="flex items-center gap-1 text-xs">
								<input
									type="checkbox"
									checked={selectedModelIds.includes(m.id)}
									onChange={(e) =>
										setSelectedModelIds((prev) =>
											e.target.checked ? [...prev, m.id] : prev.filter((id) => id !== m.id),
										)
									}
								/>
								{m.name}
							</label>
						))}
					</div>
				</fieldset>
				<fieldset className="flex flex-col gap-1">
					<legend className="text-xs font-medium">Renderers</legend>
					<div className="flex flex-wrap gap-2">
						{RENDERERS.map((r) => (
							<label key={r.id} className="flex items-center gap-1 text-xs">
								<input
									type="checkbox"
									checked={selectedRendererIds.includes(r.id)}
									onChange={(e) =>
										setSelectedRendererIds((prev) =>
											e.target.checked ? [...prev, r.id] : prev.filter((id) => id !== r.id),
										)
									}
								/>
								{r.label}
							</label>
						))}
					</div>
				</fieldset>
				<label className="flex items-center gap-1 text-xs">
					<input type="checkbox" checked={showRaw} onChange={(e) => setShowRaw(e.target.checked)} />
					Show raw markdown
				</label>
				<button
					type="button"
					onClick={() => {
						setRunId((n) => n + 1);
					}}
					className="ml-auto rounded bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:opacity-90"
				>
					Run
				</button>
			</section>

			<section className="flex flex-col gap-6">
				{runs.map(({ modelId, runId: rid }) => (
					<ModelRunRow
						key={`${modelId}-${rid}`}
						modelId={modelId}
						systemPrompt={systemPrompt}
						userPrompt={userPrompt}
						renderers={activeRenderers}
						showRaw={showRaw}
					/>
				))}
			</section>
		</div>
	);
}

type ModelRunRowProps = {
	modelId: string;
	systemPrompt: string;
	userPrompt: string;
	renderers: RendererDef[];
	showRaw: boolean;
};

function ModelRunRow({ modelId, systemPrompt, userPrompt, renderers, showRaw }: ModelRunRowProps) {
	const [output, setOutput] = useState("");
	const [status, setStatus] = useState<"idle" | "streaming" | "done" | "error">("idle");
	const [error, setError] = useState<string | null>(null);
	const [startMs, setStartMs] = useState<number | null>(null);
	const [endMs, setEndMs] = useState<number | null>(null);

	const model = WORKSPACE_AI_CHAT_MODELS.find((m) => m.id === modelId);

	const run = useCallback(async () => {
		setOutput("");
		setError(null);
		setStatus("streaming");
		setStartMs(Date.now());
		setEndMs(null);
		try {
			const res = await fetch("/api/v1/math-eval", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ modelId, systemPrompt, userPrompt }),
			});
			if (!res.ok || !res.body) {
				const text = await res.text();
				setError(`HTTP ${res.status}: ${text}`);
				setStatus("error");
				return;
			}
			const reader = res.body.getReader();
			const decoder = new TextDecoder();
			let done = false;
			while (!done) {
				const chunk = await reader.read();
				done = chunk.done;
				if (chunk.value) {
					setOutput((prev) => prev + decoder.decode(chunk.value, { stream: true }));
				}
			}
			setStatus("done");
			setEndMs(Date.now());
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
			setStatus("error");
		}
	}, [modelId, systemPrompt, userPrompt]);

	const latency = startMs && endMs ? ((endMs - startMs) / 1000).toFixed(2) : null;

	return (
		<div className="flex flex-col gap-2 rounded border border-border p-3">
			<div className="flex items-baseline justify-between">
				<div className="flex items-baseline gap-2">
					<h2 className="text-sm font-semibold">{model?.name ?? modelId}</h2>
					<span className="text-xs text-muted-foreground">{model?.gatewayModel}</span>
				</div>
				<div className="flex items-center gap-2 text-xs text-muted-foreground">
					<span>{status === "streaming" ? "streaming…" : status === "done" ? "done" : status}</span>
					{latency && <span>· {latency}s</span>}
					<button
						type="button"
						onClick={() => {
							void run();
						}}
						className="rounded border border-border px-2 py-0.5 hover:bg-muted"
					>
						Re-run
					</button>
				</div>
			</div>

			{error && <div className="text-xs text-red-600">{error}</div>}

			<div
				className="grid gap-3"
				style={{ gridTemplateColumns: `repeat(${renderers.length}, minmax(0, 1fr))` }}
			>
				{renderers.map((r) => (
					<div key={r.id} className="flex flex-col gap-1">
						<div className="text-xs font-medium">{r.label}</div>
						<div className="text-[10px] text-muted-foreground">{r.description}</div>
						<div className="min-h-[80px] rounded border border-border bg-background p-2">
							<Streamdown
								mode="streaming"
								isAnimating={status === "streaming"}
								linkSafety={{ enabled: false }}
								plugins={r.plugins}
							>
								{r.transform ? r.transform(output) : output}
							</Streamdown>
						</div>
					</div>
				))}
			</div>

			{showRaw && (
				<details className="text-xs">
					<summary className="cursor-pointer text-muted-foreground">Raw markdown</summary>
					<pre className="mt-1 whitespace-pre-wrap rounded bg-muted p-2 font-mono text-[11px]">
						{output}
					</pre>
				</details>
			)}
		</div>
	);
}
