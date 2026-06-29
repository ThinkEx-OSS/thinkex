# Agents

Skills: `.agents/skills/` — routing and repo config in `.agents/skills/README.md`.

## Commands

- Install: `pnpm install --frozen-lockfile`
- Local dev with Infisical: `pnpm dev`
- Dev server with existing env or `.dev.vars`: `pnpm serve:dev`
- Validate changes: `pnpm verify`

Do not run deploy, remote migration, legacy-data, or secret-management commands unless explicitly asked.

## Local dev caveats

Non-obvious gotchas for running the app locally (and for automated/agent setups without the full Infisical + Cloudflare credential stack).

- **Node `>=22.18`**: `vite-plus` (`vp`) loads a native binding that requires Node `^22.18.0 || >=24.11.0`. On an older Node 22 (e.g. 22.14) `pnpm install` silently skips the platform binary and `vp`/`vp config` then fail with `Cannot find module '@voidzero-dev/vite-plus-*'`. Use a current Node 22 (or 24) and reinstall.
- **Run the dev server without Infisical**: `pnpm dev` wraps Infisical for secrets. If you don't have Infisical access, copy `.dev.vars.example` to `.dev.vars` (gitignored) and use `pnpm serve:dev`; cloud sandboxes can inject the same vars as environment variables instead. Only `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` are needed to run; all other secrets gate optional features. Note: only names declared in `secrets.required` in `wrangler.jsonc` are loaded from `.dev.vars`/env, so adding a brand-new secret means adding its name there too. See `docs/ENVIRONMENT.md`.
- **Running without Cloudflare credentials**: several bindings are `remote: true` (`AI`, `BROWSER`, `EMAIL`), so by default the Cloudflare Vite plugin tries to open a remote proxy session and aborts when not logged in. Set `CLOUDFLARE_VITE_FORCE_LOCAL=true` (e.g. `CLOUDFLARE_VITE_FORCE_LOCAL=true pnpm serve:dev`) to run fully local. This disables those remote-only features (AI chat, web browse, email invites); core workspace/document/auth features still work.
- **Docker must be running before the dev server**: the worker declares Cloudflare Containers (`Sandbox`, Gotenberg `OfficePdfConverter`, `ImageFileConverter`) and `vp dev` hard-fails at startup if the Docker CLI/daemon is unavailable. The first startup pulls/builds the (large) images; later startups reuse the cache.
- **Local D1**: run `pnpm db:migrate:local` before first auth/DB use (state persists under `.wrangler/`). The Vite plugin does not auto-apply migrations.
- **Auth without Google OAuth**: in local dev the auth page shows a **Continue as guest** button (anonymous session) alongside Google, so no OAuth creds are needed. For headless automation, hit the endpoint directly: `POST /api/auth/sign-in/anonymous` with header `Content-Type: application/json` and body `{}`, then reuse the cookie; this is enough to reach `/home` and create a workspace.
