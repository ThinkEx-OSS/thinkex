# Agents

Skills: `.agents/skills/` — routing and repo config in `.agents/skills/README.md`.

## Commands

- Install: `vp install --frozen-lockfile`
- Local dev with Infisical: `pnpm dev`
- Dev server with existing env or `.dev.vars`: `pnpm serve:dev`
- Validate changes: `pnpm verify`

Do not run deploy, remote migration, legacy-data, or secret-management commands unless explicitly asked.

## Local dev caveats

Non-obvious gotchas for running the app locally (and for automated/agent setups without the full Infisical + Cloudflare credential stack).

- **Current Node LTS**: this repo pins Node `24` in `.node-version` and `package.json#engines` requires Node `>=24.11.0 <25`. Use Vite+ managed mode (`vp env setup` once, then `vp env on`) so `node`, `npm`, `npx`, and Corepack resolve through the repo pin. If managing Node yourself, use the current Node 24 LTS line.
- **Environment diagnostics**: if `node`, `pnpm`, or Corepack look wrong, run `vp env doctor` from the repo root before changing tool versions.
- **Worktrees and agent checkouts**: create the worktree, enter it, and run `vp install --frozen-lockfile` before `pnpm serve:dev`, `pnpm check`, or `pnpm verify`. pnpm's normal content-addressable store is shared across worktrees; do not enable the global virtual store here because this Vite+/Rolldown stack needs the standard local virtual-store layout for native bindings.
- **Cached verification**: `pnpm verify` routes through Vite+ tasks (`ciCheck`, `ciTest`, `ciBuild`) so repeated local/agent checks can use Vite Task caching.
- **Run the dev server without Infisical**: `pnpm dev` wraps Infisical for secrets. If you don't have Infisical access, copy `.dev.vars.example` to `.dev.vars` (gitignored) and use `pnpm serve:dev`; cloud sandboxes can inject the same vars as environment variables instead. Only `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` are needed to run; all other secrets gate optional features. Note: only names declared in `secrets.required` in `wrangler.jsonc` are loaded from `.dev.vars`/env, so adding a brand-new secret means adding its name there too. See `docs/ENVIRONMENT.md`.
- **Running without Cloudflare credentials**: several bindings are `remote: true` (`AI`, `BROWSER`, `EMAIL`), so by default the Cloudflare Vite plugin tries to open a remote proxy session and aborts when not logged in. Set `CLOUDFLARE_VITE_FORCE_LOCAL=true` (e.g. `CLOUDFLARE_VITE_FORCE_LOCAL=true pnpm serve:dev`) to run fully local. This disables those remote-only features (AI chat, web browse, email invites); core workspace/document/auth features still work.
- **Docker must be running before the dev server**: the worker declares Cloudflare Containers (`Sandbox`, Gotenberg `OfficePdfConverter`, `ImageFileConverter`) and `vp dev` hard-fails at startup if the Docker CLI/daemon is unavailable. The first startup pulls/builds the (large) images; later startups reuse the cache.
- **Local D1**: run `pnpm db:migrate:local` before first auth/DB use (state persists under `.wrangler/`). The Vite plugin does not auto-apply migrations.
- **Auth without Google OAuth**: in local dev the auth page shows a **Continue as guest** button (anonymous session) alongside Google, so no OAuth creds are needed. For headless automation, hit the endpoint directly: `POST /api/auth/sign-in/anonymous` with header `Content-Type: application/json` and body `{}`, then reuse the cookie; this is enough to reach `/home` and create a workspace.
