# Contributing to ThinkEx

Thanks for your interest in contributing to **ThinkEx**!
We welcome bug reports, feature suggestions, and pull requests.

Please read this guide before getting started.

---

## Project Scope & Expectations

ThinkEx is a **production application**, not a demo or template.
Contributions should prioritize:

- Reliability
- Maintainability
- Clear user value

---

## Development Setup

ThinkEx is a React and TanStack Start app deployed on Cloudflare Workers. The repository pins Node 24 and pnpm through Vite+ managed tooling.

Prerequisites:

- Node.js 24 (`>=24.11.0 <25`)
- pnpm 11
- Docker, for the local Cloudflare Container bindings
- Infisical access if you are on the core team, or a local `.dev.vars` file if you are not

```bash
git clone https://github.com/ThinkEx-OSS/thinkex.git
cd thinkex
vp install --frozen-lockfile
```

Core team members with Infisical access can run:

```bash
pnpm dev
```

Contributors without Infisical should copy `.dev.vars.example` to `.dev.vars`, set `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL`, then run:

```bash
pnpm serve:dev
```

The app runs at [http://localhost:3000](http://localhost:3000). See [`docs/ENVIRONMENT.md`](docs/ENVIRONMENT.md) for local secrets, guest sign-in, Cloudflare credential caveats, and local D1 setup.

## Useful Commands

```bash
pnpm dev
pnpm serve:dev
pnpm check
pnpm test
pnpm build
pnpm verify
```

Use `pnpm verify` before opening a pull request when possible.

## Help

Join the [ThinkEx Discord](https://discord.gg/dtPnzkqCcG) if you need help with setup, contribution scope, or local development.

## Pull Requests

- Keep changes focused.
- Explain what changed and why.
- Include testing notes.
- Do not include generated build output.
- Do not run deployment, remote migration, legacy-data, or secret-management commands unless a maintainer asks for them.
