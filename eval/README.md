# AI evals

Regression net for the workspace AI agent. Prompt / schema / model changes get
pinned so a regression shows up before it ships. Two layers, cheapest first:

## Layer 1 — free, every PR (`pnpm test`)

`src/features/workspaces/operations/workspace-tool-surface.test.ts` snapshots the
model-facing surface: the assembled system prompt and every tool's input JSON
schema (field `.describe()` text included). Zero model calls. A schema-shape,
field-description, or soul-prompt change is a reviewable snapshot diff. Update
deliberate changes with `pnpm test -u`.

This catches most "did my schema/prompt edit break something" regressions without
spending a token. It runs in normal CI because the schema layer is a pure leaf
(`workspace-tool-schemas.ts` → `workspace-operation-failure-codes.ts`, no kernel).

## Layer 2 — live behavior, on demand (`pnpm eval`)

What Layer 1 can't see: does the model actually pick the right tool, fill valid
arguments, respect a read-only turn, answer well. Real model turns through the real
gateway wiring — billed and slow, so **not** in `pnpm test`.

```bash
pnpm eval          # once
pnpm eval:watch    # iterate
```

Both wrap in `infisical run` for `AI_GATEWAY_API_KEY`. Without a key the suite
skips instead of failing. Gate a CI job for it on changes to
`src/features/workspaces/ai/**` and `*-schemas.ts`.

### Why the workers pool

Layer 2 uses the real tool _definitions_ (descriptions + execute), which are
worker-runtime code (kernel, Durable Objects, `cloudflare:workers`). So — like the
app's own `*.worker.test.ts` — it runs in the Cloudflare workers pool
(`vitest.evals.config.ts`), with the gateway key injected as a miniflare binding.
No stubbing, no drift from what ships. Tool _execution_ is stubbed (we grade
selection + arg validity, not mutations).

### Layout

| File                                | Role                                                                                                                                                |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `support/harness.ts`                | `runWorkspaceAgent(input)` — one real model turn with the real tools; normalizes the result and re-validates each tool call against its zod schema. |
| `support/scorers.ts`                | `(output) => { score, pass, message }`: schema validity, expected/forbidden tool choice, LLM-as-judge for prose.                                    |
| `datasets/workspace-tools.cases.ts` | The test set. The asset that matters — grow it.                                                                                                     |
| `workspace-tools.eval.ts`           | Plain `describe`/`it.for` tying cases + scorers together.                                                                                           |

### Add a case

```ts
{
  name: "creates a doc at an explicit path",
  input: { prompt: "Create /Notes/Standup.md ..." },
  expectedTools: ["workspace_create_items"],
  forbiddenTools: ["workspace_delete_items"],
  qualityRubric: "optional — grade the prose answer with the LLM judge",
}
```

Best source for new cases: real turns mined from the telemetry recorders
(`ai-inspector*.ts`), especially thumbs-down / low-scored ones.

The scorers are plain functions, so if you later want hosted score-trend
dashboards + PR gating, you can lift the dataset + scorers onto a platform
(Braintrust) or adopt [`vitest-evals`](https://github.com/getsentry/vitest-evals)
for its judges + tool-call replay — without rewriting the eval logic.
