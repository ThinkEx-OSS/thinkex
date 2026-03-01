# Contributing to ThinkEx

Thanks for your interest in contributing to **ThinkEx**!
We welcome bug reports, feature suggestions, and pull requests.

Please read this guide before getting started. See also our [Code of Conduct](CODE_OF_CONDUCT.md) and [Security Policy](SECURITY.md) for reporting vulnerabilities.

---

## Project Scope & Expectations

ThinkEx is a **production application**, not a demo or template.
Contributions should prioritize:
- Reliability
- Maintainability
- Clear user value

---

## Development Setup

### Prerequisites
- Node.js **v20+**
- pnpm
- PostgreSQL (local or Docker)

### Quick Setup (Recommended)

Run the interactive setup script:
```bash
git clone https://github.com/ThinkEx-OSS/thinkex.git
cd thinkex
./setup.sh
```

### Manual Setup
```bash
git clone https://github.com/ThinkEx-OSS/thinkex.git
cd thinkex
pnpm install
cp .env.example .env
pnpm db:push
pnpm dev
```

### Lint and type check

| Command | Purpose |
|---------|---------|
| `pnpm lint` | ESLint: style, best practices, potential bugs. Uses [Next.js ESLint config](https://nextjs.org/docs/app/building-your-application/configuring/eslint). |
| `pnpm tc` | TypeScript compiler: type-check only (`tsc --noEmit`). Catches type errors, no emit. |
| `pnpm lint:fix` | Auto-fix lint issues where possible. |

Use both before committing. Lint handles code style and patterns; `tc` ensures types are correct.
