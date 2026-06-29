# Environment

ThinkEx reads runtime config from Cloudflare bindings, environment variables, and local `.dev.vars` files. Infisical is the shared secret source for the core team, but it is **not required** to run the app locally.

## How config is supplied

Pick whichever fits your setup — the worker reads the same variable names in every case:

| Path | Who | How variables arrive |
| --- | --- | --- |
| `pnpm dev` | Core team with Infisical access | Infisical injects `dev:/app` secrets, then runs the dev server |
| `pnpm serve:dev` | Anyone | Reads a local, gitignored `.dev.vars` file (copy `.dev.vars.example`) |
| `pnpm serve:dev` | Cloud agents / sandboxes | The sandbox injects the same names into `process.env` |

Contributors without Infisical should copy `.dev.vars.example` to `.dev.vars` and run `pnpm serve:dev`.

## How secrets are declared

`wrangler.jsonc` declares every secret the worker uses under `secrets.required`. That list is the source of truth: it drives `wrangler types` and, in local dev, **only the names listed there are loaded** from `.dev.vars` / `.env` / `process.env` (other keys are ignored). So an undeclared variable will silently never reach the worker — add the name to `secrets.required` if you introduce a new secret.

Declared but unset secrets only produce a harmless `Missing required secrets: …` warning at dev startup; they do not stop the server.

## Required vs optional in practice

The dev server boots and lets you sign in with just the two variables below. Everything else is declared but optional — leave it unset and the matching feature stays off.

### Required to run

| Variable | Purpose |
| --- | --- |
| `BETTER_AUTH_SECRET` | Signs auth sessions. Any random 32+ char string. |
| `BETTER_AUTH_URL` | Canonical app origin (e.g. `http://localhost:3000`). |

### Optional (feature-gated)

| Variable | Feature when set | Behavior when unset |
| --- | --- | --- |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google sign-in | Google sign-in fails; use **Continue as guest** (shown in local dev) |
| `AI_GATEWAY_API_KEY` | AI chat / title generation (Vercel AI Gateway) | AI calls error when invoked |
| `FIRECRAWL_API_KEY` | Web search + URL/PDF extraction (Firecrawl) | Those calls error when invoked |
| `LLAMA_CLOUD_API_KEY` | Document extraction (LlamaParse) | Those calls error when invoked |

## Signing in without Google

In local dev (and dev-server-based cloud agents) the auth page shows a **Continue as guest** button alongside Google. It creates an anonymous session — enough to reach `/home` and create a workspace — so you can work without configuring Google OAuth. The button is compiled out of production builds (`import.meta.env.DEV`), so it never becomes a visible end-user option there.

Automation can also hit the anonymous endpoint directly against a dev server:

```bash
curl -i -c .auth.cookies -b .auth.cookies \
  -H "Content-Type: application/json" \
  -X POST "$APP_ORIGIN/api/auth/sign-in/anonymous" -d '{}'
```

Reuse the same cookie jar for follow-up requests. Linking a guest to a real account later migrates the guest's workspaces to that account.

## Secret paths (Infisical)

| Path | Purpose |
| --- | --- |
| `dev:/app` | Normal local developer secrets |
| `dev:/agents` | Sandbox secrets for hosted agent/dev-server environments |

Cloud agents should not receive production credentials, deploy tokens, migration tokens, or legacy database credentials unless a task explicitly requires them.

## Runtime sync

Cloudflare Worker secrets are synced from Infisical for deployed environments. Local and hosted-agent dev servers should use Infisical-injected variables, injected environment variables, or a gitignored `.dev.vars` file.
