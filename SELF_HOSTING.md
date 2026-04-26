# Self-Hosting ThinkEx

This repo currently supports a **core self-host** profile for local development:

- PostgreSQL
- Better Auth secret + app URL
- Zero cache server
- Local filesystem storage

`pnpm dev` is the supported one-command entrypoint. It starts:

- Next.js
- the AI SDK devtools
- Zero

## Quick Start

```bash
git clone https://github.com/ThinkEx-OSS/thinkex.git
cd thinkex
./setup.sh
pnpm dev
```

If you prefer to bootstrap manually:

```bash
pnpm install
cp .env.example .env
docker-compose up -d postgres
pnpm db:push
pnpm dev
```

## Core Self-Host Environment

The minimum local profile needs these groups configured:

- App/auth:
  - `NEXT_PUBLIC_APP_URL`
  - `BETTER_AUTH_URL`
  - `NEXT_PUBLIC_BETTER_AUTH_URL`
  - `BETTER_AUTH_SECRET`
- Database:
  - `DATABASE_URL`
- Zero:
  - `NEXT_PUBLIC_ZERO_SERVER`
  - `ZERO_UPSTREAM_DB`
  - `ZERO_QUERY_URL`
  - `ZERO_MUTATE_URL`
  - `ZERO_MUTATE_FORWARD_COOKIES`
  - `ZERO_QUERY_FORWARD_COOKIES`
  - `ZERO_APP_PUBLICATIONS`
  - `ZERO_ADMIN_PASSWORD`
  - `ZERO_APP_ID`
  - `ZERO_COOKIE_DOMAIN`
- Storage:
  - `STORAGE_TYPE=local`
  - `UPLOADS_DIR`

`./setup.sh` populates sensible local defaults for the core profile and creates the `zero_pub` publication used by the local Zero process.

## Zero

Zero is required for workspace sync in local development. ThinkEx does not currently support a non-Zero workspace mode.

Use:

```bash
pnpm dev
```

The repo also includes `pnpm run dev:zero` as a debugging hook, but `pnpm dev` is the supported workflow.

## Local File Storage

ThinkEx uses `STORAGE_TYPE=local` by default for the core self-host profile. That supports:

- local uploads
- viewing uploaded files inside the app
- deleting uploaded files

It does **not** make files reachable to third-party providers.

## Unsupported in Core Local Mode

These features require provider-reachable object storage and the relevant API keys:

- OCR
- audio transcription
- office document conversion

In local-file core mode, those flows are intentionally blocked with explicit capability errors.

## Optional Integrations

You can still configure optional integrations from `.env.example`, including:

- Supabase storage for provider-reachable uploads
- Google OAuth
- Mistral OCR
- AssemblyAI
- FastAPI conversion
- Firecrawl
- E2B
- PostHog
- Resend
- Supermemory
- YouTube metadata

Those are not required to boot the core self-host profile.
