# Agents

Skills: `.agents/skills/` — routing and repo config in `.agents/skills/README.md`.

## Commands

- Install: `pnpm install --frozen-lockfile`
- Local dev with Infisical: `pnpm dev`
- Dev server with existing env or `.dev.vars`: `pnpm serve:dev`
- Validate changes: `pnpm verify`

Do not run deploy, remote migration, legacy-data, or secret-management commands unless explicitly asked.

## Cloud agent / local dev instructions

Non-obvious run/startup caveats for cloud agents and local development. In a provisioned cloud VM, dependencies, Node, Docker, and a gitignored `.dev.vars` already exist and `pnpm install --frozen-lockfile` runs on startup.

- **Node version**: `vite-plus` (`vp`) loads a native binding that requires Node `^22.18.0`. The VM ships Node 22.23 via symlinks in `/usr/local/cargo/bin` (first on `PATH`, so non-interactive shells and the update script use it). The default `/exec-daemon/node` is 22.14 and is too old — never override the symlinks with it, or `pnpm install`'s `prepare` step (`vp config`) and `vp` will fail to load the binding.
- **Run the dev server with `pnpm serve:dev`, not `pnpm dev`.** `pnpm dev` wraps Infisical, which has no credentials here. `pnpm serve:dev` reads the gitignored `.dev.vars` (already present: `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_ALLOWED_HOSTS`). See `docs/ENVIRONMENT.md`.
- **Set `CLOUDFLARE_VITE_FORCE_LOCAL=true`** when starting the dev server, i.e. `CLOUDFLARE_VITE_FORCE_LOCAL=true pnpm serve:dev`. Without it the Cloudflare Vite plugin tries to open a remote proxy session for `remote: true` bindings (`AI`, `BROWSER`, `EMAIL`) and aborts because there are no Cloudflare credentials. Forcing local disables those remote-only features (AI chat, web browse, email invites); core workspace/document/auth features still work.
- **Docker must be running before `pnpm serve:dev`.** The worker declares Cloudflare Containers (`Sandbox`, Gotenberg `OfficePdfConverter`, `ImageFileConverter`) and the dev server hard-fails at startup if the Docker CLI/daemon is unavailable. Docker (with `fuse-overlayfs` storage driver and the `containerd-snapshotter` feature disabled in `/etc/docker/daemon.json`) is installed but not auto-started. Start it once per session with `sudo dockerd &` and, if the socket is root-owned, `sudo chmod 666 /var/run/docker.sock`. Container images are large; the first dev startup pulls/builds them, later startups reuse the cache.
- **Local D1**: run `pnpm db:migrate:local` before first auth/DB use (state persists under `.wrangler/`). The Vite plugin does not auto-apply migrations.
- **Auth for testing**: the only UI sign-in is Google (needs real OAuth creds). For automated/agent sessions create a guest session via `POST /api/auth/sign-in/anonymous` with header `Content-Type: application/json` and body `{}`, then reuse the cookie; this is enough to reach `/home` and create a workspace.
