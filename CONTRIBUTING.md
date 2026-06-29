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

ThinkEx is a React and TanStack Start app deployed on Cloudflare Workers.

Prerequisites:

- Node.js
- pnpm
- Infisical access for local secrets

```bash
git clone https://github.com/ThinkEx-OSS/thinkex.git
cd thinkex
pnpm install
pnpm dev
```

The app runs at [http://localhost:3000](http://localhost:3000).

## Useful Commands

```bash
pnpm dev
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
