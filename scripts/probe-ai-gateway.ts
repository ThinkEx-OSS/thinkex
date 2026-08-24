/**
 * Vercel AI Gateway health probe.
 *
 * Sends tiny real requests through the gateway for every model in the picker,
 * first exactly as production routes them, then pinned to each individual
 * provider leg of the fallback chain. Answers two questions the gateway
 * dashboard can't: does every configured slug still exist, and does every BYOK
 * credential actually serve traffic (or is a fallback leg dead on arrival)?
 *
 * Run: pnpm probe:gateway  (or --phase=load to only exercise the BYOK timeout)
 * Flags: --phase=catalog|configured|pinned|load|all  --tools=on|off  --concurrency=N
 * Full results land in .context/ai-gateway-probe.json.
 *
 * The probe imports production configuration so it cannot silently drift.
 */
import { mkdir, writeFile } from "node:fs/promises";

import { createGateway, generateText, stepCountIs, tool } from "ai";
import { z } from "zod";

import {
	getAIThreadTitleGatewayRoutingOptions,
	getWorkspaceAiGatewayRoutingOptions,
} from "#/features/workspaces/ai/ai-gateway-routing.ts";
import {
	AI_THREAD_TITLE_GATEWAY_MODEL,
	getAIThreadTitleGatewayProviderOptions,
	getWorkspaceAiGatewayProviderOptions,
	getWorkspaceAiGatewayTransportOptions,
} from "#/features/workspaces/ai/gateway.ts";
import {
	getWorkspaceAiChatModel,
	WORKSPACE_AI_CHAT_MODELS,
	type WorkspaceAiChatModelId,
} from "#/features/workspaces/ai/models.ts";

const REQUEST_TIMEOUT_MS = 90_000;

type Args = { phase: string; tools: boolean; concurrency: number };

function parseArgs(): Args {
	const get = (name: string) =>
		process.argv.find((arg) => arg.startsWith(`--${name}=`))?.split("=")[1];

	return {
		phase: get("phase") ?? "all",
		tools: get("tools") !== "off",
		concurrency: Number(get("concurrency") ?? 4),
	};
}

const transportOptions = getWorkspaceAiGatewayTransportOptions();

function reasoningOptions(modelId: WorkspaceAiChatModelId): Record<string, unknown> {
	const { gateway: _gateway, ...providerOptions } = getWorkspaceAiGatewayProviderOptions({
		modelId,
	});
	return providerOptions;
}

function titleProviderOptions(): Record<string, unknown> {
	const { gateway: _gateway, ...providerOptions } = getAIThreadTitleGatewayProviderOptions();
	return providerOptions;
}

function providersForSlug(slug: string) {
	return slug.startsWith("openai/")
		? ["openai", "azure"]
		: slug.startsWith("google/")
			? ["google", "vertex"]
			: ["anthropic"];
}

/** Every model leg with the provider options of the production route that owns it. */
function buildPinnedRoutes() {
	const chatRoutes = WORKSPACE_AI_CHAT_MODELS.flatMap((model) => {
		const routing = getWorkspaceAiGatewayRoutingOptions(model.id);
		return [getWorkspaceAiChatModel(model.id), ...routing.models].map((slug) => ({
			label: `${model.id}: ${slug}`,
			slug,
			providers: providersForSlug(slug),
			extraProviderOptions: reasoningOptions(model.id),
		}));
	});
	const titleRouting = getAIThreadTitleGatewayRoutingOptions();
	const titleRoutes = [AI_THREAD_TITLE_GATEWAY_MODEL, ...titleRouting.models].map((slug) => ({
		label: `thread-title: ${slug}`,
		slug,
		providers: providersForSlug(slug),
		extraProviderOptions: titleProviderOptions(),
	}));

	return [...chatRoutes, ...titleRoutes];
}

/** Every slug the config references, primary or fallback. */
function allReferencedSlugs() {
	const slugs = new Set<string>([AI_THREAD_TITLE_GATEWAY_MODEL]);

	for (const model of WORKSPACE_AI_CHAT_MODELS) {
		slugs.add(getWorkspaceAiChatModel(model.id));
		for (const fallback of getWorkspaceAiGatewayRoutingOptions(model.id).models) {
			slugs.add(fallback);
		}
	}
	for (const fallback of getAIThreadTitleGatewayRoutingOptions().models) {
		slugs.add(fallback);
	}

	return [...slugs].sort();
}

// "load" sends a production-sized context so `providerTimeouts.byok` is exercised
// — a one-word prompt always finishes inside it and hides the problem.
type ProbeMode = "text" | "tool" | "load";

type ProbeResult = {
	phase: "configured" | "pinned" | "load";
	label: string;
	slug: string;
	pinnedProvider?: string;
	mode: ProbeMode;
	ok: boolean;
	ms: number;
	servedModel?: string;
	servedProvider?: string;
	credentialType?: string;
	attempts?: string[];
	toolCalled?: boolean;
	finishReason?: string;
	inputTokens?: number;
	/** Served, but only after a BYOK leg failed — silently on Vercel's credits. */
	byokDegraded?: boolean;
	byokFailures?: string[];
	fallbacksAvailable?: string[];
	planningReasoning?: string;
	error?: string;
};

// ~70k input tokens — roughly one step of a real research thread.
const LOAD_PROMPT_REPEATS = 4000;

function researchFiller(repeats: number) {
	return `Research notes:\n${"The quarterly report analysed regional demand, pricing pressure, and channel mix in detail. ".repeat(repeats)}\n\n`;
}

const weatherTool = tool({
	description: "Get the current temperature for a city.",
	inputSchema: z.object({ city: z.string().describe("City name") }),
	execute: async ({ city }: { city: string }) => ({ city, celsius: 21 }),
});

type ProviderAttempt = {
	provider?: string;
	credentialType?: string;
	success?: boolean;
	statusCode?: number;
	error?: string;
	startTime?: number;
	endTime?: number;
};

function summarizeRouting(metadata: unknown) {
	const gateway = (metadata as { gateway?: Record<string, unknown> } | undefined)?.gateway;
	const routing = gateway?.routing as
		| {
				modelAttempts?: { providerAttempts?: ProviderAttempt[] }[];
				fallbacksAvailable?: string[];
				planningReasoning?: string;
		  }
		| undefined;

	const attempts = routing?.modelAttempts?.flatMap((model) => model.providerAttempts ?? []) ?? [];
	const served = attempts.find((attempt) => attempt.success) ?? attempts.at(-1);
	const byokFailures = attempts
		.filter((attempt) => attempt.credentialType === "byok" && !attempt.success)
		.map(
			(attempt) =>
				`${attempt.provider}: ${attempt.statusCode ?? ""} ${attempt.error ?? ""}`
					.trim()
					.slice(0, 160) +
				(attempt.endTime && attempt.startTime ? ` (${attempt.endTime - attempt.startTime}ms)` : ""),
		);

	return {
		servedProvider: served?.provider,
		credentialType: served?.credentialType,
		byokFailures,
		byokDegraded: byokFailures.length > 0,
		fallbacksAvailable: routing?.fallbacksAvailable,
		planningReasoning: routing?.planningReasoning,
		attempts: attempts.map(
			(attempt) =>
				`${attempt.provider}/${attempt.credentialType ?? "?"}:${attempt.statusCode ?? (attempt.success ? "ok" : "err")}`,
		),
	};
}

function describeError(error: unknown) {
	const err = error as {
		name?: string;
		message?: string;
		statusCode?: number;
		responseBody?: string;
		cause?: { message?: string };
	};
	const parts = [
		err?.statusCode ? `HTTP ${err.statusCode}` : undefined,
		err?.name,
		err?.message ?? String(error),
		err?.cause?.message && err.cause.message !== err.message
			? `cause: ${err.cause.message}`
			: undefined,
		err?.responseBody ? `body: ${err.responseBody}` : undefined,
	].filter(Boolean);

	return parts.join(" | ").replaceAll(/\s+/g, " ").slice(0, 500);
}

type ProbeJob = {
	gateway: ReturnType<typeof createGateway>;
	phase: ProbeResult["phase"];
	label: string;
	slug: string;
	pinnedProvider?: string;
	mode: ProbeMode;
	gatewayOptions: Record<string, unknown>;
	extraProviderOptions?: Record<string, unknown>;
};

async function probe(input: ProbeJob): Promise<ProbeResult> {
	const start = Date.now();
	const base = {
		phase: input.phase,
		label: input.label,
		slug: input.slug,
		pinnedProvider: input.pinnedProvider,
		mode: input.mode,
	};

	try {
		const result = await generateText({
			model: input.gateway(input.slug),
			abortSignal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
			// Generous even for one word: reasoning models spend this budget on
			// thinking tokens first and return empty text if it runs out.
			maxOutputTokens: 1024,
			providerOptions: {
				gateway: {
					...transportOptions,
					...input.gatewayOptions,
					tags: ["app:thinkex", "feature:gateway-probe"],
				},
				...input.extraProviderOptions,
			},
			...(input.mode === "text"
				? { prompt: "Reply with the single word: ok" }
				: {
						prompt:
							(input.mode === "load" ? researchFiller(LOAD_PROMPT_REPEATS) : "") +
							"What is the temperature in Doha? Use the tool.",
						tools: { get_temperature: weatherTool },
						toolChoice: "required" as const,
						stopWhen: stepCountIs(2),
					}),
		});

		const toolCalled = result.steps.some((step) => step.toolCalls.length > 0);

		return {
			...base,
			ok: input.mode === "text" ? result.text.trim().length > 0 : toolCalled,
			ms: Date.now() - start,
			servedModel: result.response?.modelId,
			finishReason: result.finishReason,
			inputTokens: result.usage?.inputTokens,
			toolCalled: input.mode === "text" ? undefined : toolCalled,
			...summarizeRouting(result.providerMetadata),
		};
	} catch (error) {
		return { ...base, ok: false, ms: Date.now() - start, error: describeError(error) };
	}
}

async function mapWithConcurrency<T, R>(
	items: T[],
	limit: number,
	fn: (item: T) => Promise<R>,
): Promise<R[]> {
	const results = new Array<R>(items.length);
	let cursor = 0;

	await Promise.all(
		Array.from({ length: Math.min(limit, items.length) }, async () => {
			while (cursor < items.length) {
				const index = cursor++;
				results[index] = await fn(items[index] as T);
			}
		}),
	);

	return results;
}

function printTable(rows: ProbeResult[]) {
	const table = rows.map((row) => ({
		probe: row.label,
		mode: row.mode,
		ok: row.ok ? "PASS" : "FAIL",
		ms: row.ms,
		served: row.servedModel ?? "-",
		via: row.servedProvider ? `${row.servedProvider} (${row.credentialType ?? "?"})` : "-",
		detail: row.error ?? (row.attempts?.length ? row.attempts.join(" -> ") : ""),
	}));

	console.table(table);
}

async function main() {
	const args = parseArgs();
	const apiKey = process.env.AI_GATEWAY_API_KEY;

	if (!apiKey) {
		console.error("AI_GATEWAY_API_KEY missing. Run under: infisical run --env=dev --path=/app --");
		process.exit(1);
	}

	const gateway = createGateway({ apiKey });
	const results: ProbeResult[] = [];
	const catalogIssues: string[] = [];

	if (args.phase === "all" || args.phase === "catalog") {
		console.log("\n=== Phase 1: catalog ===");
		const response = await fetch("https://ai-gateway.vercel.sh/v1/models", {
			headers: { authorization: `Bearer ${apiKey}` },
		});
		const body = (await response.json()) as { data?: { id: string }[] };
		const available = new Set((body.data ?? []).map((model) => model.id));

		for (const slug of allReferencedSlugs()) {
			const present = available.has(slug);
			if (!present) catalogIssues.push(slug);
			console.log(`${present ? "PASS" : "FAIL"}  ${slug}`);
		}
		console.log(`${available.size} models in catalog.`);
	}

	if (args.phase === "all" || args.phase === "configured") {
		console.log("\n=== Phase 2: as production routes it ===");
		const jobs: ProbeJob[] = WORKSPACE_AI_CHAT_MODELS.flatMap((model) => {
			const routing = getWorkspaceAiGatewayRoutingOptions(model.id);
			const modes: ProbeMode[] = args.tools ? ["text", "tool"] : ["text"];

			return modes.map((mode) => ({
				gateway,
				phase: "configured" as const,
				label: `${model.id} -> ${getWorkspaceAiChatModel(model.id)}`,
				slug: getWorkspaceAiChatModel(model.id),
				mode,
				gatewayOptions: routing as unknown as Record<string, unknown>,
				extraProviderOptions: reasoningOptions(model.id),
			}));
		});

		jobs.push({
			gateway,
			phase: "configured" as const,
			label: `thread-title -> ${AI_THREAD_TITLE_GATEWAY_MODEL}`,
			slug: AI_THREAD_TITLE_GATEWAY_MODEL,
			mode: "text",
			gatewayOptions: getAIThreadTitleGatewayRoutingOptions() as unknown as Record<string, unknown>,
			extraProviderOptions: titleProviderOptions(),
		});

		const phaseResults = await mapWithConcurrency(jobs, args.concurrency, probe);
		results.push(...phaseResults);
		printTable(phaseResults);
	}

	if (args.phase === "all" || args.phase === "pinned") {
		console.log("\n=== Phase 3: each provider leg pinned (only: [provider]) ===");
		const jobs: ProbeJob[] = buildPinnedRoutes().flatMap((route) =>
			route.providers.flatMap((provider) => {
				const modes: ProbeMode[] = args.tools ? ["text", "tool"] : ["text"];

				return modes.map((mode) => ({
					gateway,
					phase: "pinned" as const,
					label: `${route.label} @ ${provider}`,
					slug: route.slug,
					pinnedProvider: provider,
					mode,
					// only + no fallback models: isolate this leg, no silent rescue.
					gatewayOptions: { only: [provider], order: [provider] },
					extraProviderOptions: route.extraProviderOptions,
				}));
			}),
		);

		const phaseResults = await mapWithConcurrency(jobs, args.concurrency, probe);
		results.push(...phaseResults);
		printTable(phaseResults);
	}

	if (args.phase === "all" || args.phase === "load") {
		console.log("\n=== Phase 4: production-sized context (exercises providerTimeouts.byok) ===");
		const jobs: ProbeJob[] = WORKSPACE_AI_CHAT_MODELS.map((model) => ({
			gateway,
			phase: "load" as const,
			label: `${model.id} -> ${getWorkspaceAiChatModel(model.id)}`,
			slug: getWorkspaceAiChatModel(model.id),
			mode: "load" as const,
			gatewayOptions: getWorkspaceAiGatewayRoutingOptions(model.id) as unknown as Record<
				string,
				unknown
			>,
			extraProviderOptions: reasoningOptions(model.id),
		}));

		const phaseResults = await mapWithConcurrency(jobs, Math.min(args.concurrency, 2), probe);
		results.push(...phaseResults);
		printTable(phaseResults);
	}

	const outputDirectory = new URL("../.context/", import.meta.url);
	await mkdir(outputDirectory, { recursive: true });
	await writeFile(
		new URL("../.context/ai-gateway-probe.json", import.meta.url),
		JSON.stringify(results, null, 2),
	);

	const failures = results.filter((row) => !row.ok);
	const degraded = results.filter((row) => row.ok && row.byokDegraded);
	console.log(
		`\n${results.length - failures.length}/${results.length} probes passed` +
			(catalogIssues.length ? `, ${catalogIssues.length} slug(s) missing from catalog` : ""),
	);

	if (degraded.length) {
		console.log("\nBYOK degraded (served, but a leg on your own key failed first):");
		for (const row of degraded) {
			console.log(
				`  ${row.label} [${row.mode}] -> served by ${row.servedProvider} (${row.credentialType})\n` +
					row.byokFailures?.map((failure) => `      x ${failure}`).join("\n"),
			);
		}
	}

	if (failures.length) {
		console.log("\nFailures:");
		for (const failure of failures) {
			console.log(
				`  ${failure.label} [${failure.mode}] — ${failure.error ?? `empty response (finishReason: ${failure.finishReason ?? "?"})`}`,
			);
		}
	}

	process.exit(failures.length || catalogIssues.length ? 1 : 0);
}

await main();
