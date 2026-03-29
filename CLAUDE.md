# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
pnpm dev          # Start dev server
pnpm build        # Production build
pnpm lint         # ESLint
pnpm lint:fix     # Auto-fix lint issues
pnpm tc           # TypeScript type-check (no emit)
pnpm format       # Prettier format

# Testing
pnpm test         # Run Vitest once
pnpm test:watch   # Vitest in watch mode

# Database
pnpm db:generate  # Generate Drizzle migrations
pnpm db:push      # Push schema to DB (dev)
pnpm db:migrate   # Run migrations
pnpm db:studio    # Open Drizzle Studio GUI
pnpm db:reset     # Drop and recreate DB
```

**ESLint enforces a 300-line max per file.**

## Architecture Overview

ThinkEx is a single Next.js 16 app (not a monorepo) using pnpm. It's an AI-integrated canvas workspace where users organize documents, PDFs, videos, and other media spatially and interact with an AI assistant that has controlled access to that content.

### Event Sourcing

All workspace state changes are stored as immutable events in `workspace_events`. When a workspace loads, it replays events through a pure reducer to derive current state, with periodic snapshots stored in `workspace_snapshots` for performance. This is the core architectural pattern — do not bypass it by writing state directly.

Key files:
- `src/lib/workspace/events.ts` — event type definitions
- `src/lib/workspace/event-reducer.ts` — pure reducer function
- `src/lib/workspace/state-loader.ts` — loads snapshot + recent events
- `src/lib/db/schema.ts` — all table definitions (single file)

### AI Tool System

Tools are defined in `src/lib/ai/tools/` and instantiated via `createChatTools()` which injects workspace context (user, workspace, active folder). The chat API route at `src/app/api/chat/` uses these tools with the Vercel AI SDK's `streamText`.

AI context is **user-controlled** — users explicitly select cards to include. The pre-formatted context is sent from the client to the API, not fetched server-side.

### State Management Layers

1. **Server**: PostgreSQL event log + snapshots (source of truth)
2. **Zustand stores**: `src/lib/stores/` for client UI state
3. **React contexts**: `src/contexts/` for realtime, workspace state
4. **TanStack Query**: server state caching and mutations

### Auth

Better Auth (`src/lib/auth.ts`) with Google OAuth and anonymous user support. Anonymous users can be promoted to real accounts — the auth hook in `auth.ts` migrates their workspaces on account linking.

### Database

Drizzle ORM with PostgreSQL. Schema lives entirely in `src/lib/db/schema.ts`. Relations in `src/lib/db/relations.ts`. Row-Level Security is enabled on core tables.

### File Storage

Abstracted behind an adapter — supports local storage or Supabase, configured via `STORAGE_TYPE` env var.

### Key Paths

```
src/app/api/         # API routes (auth, chat, cards, pdf, youtube, deep-research)
src/app/(dashboard)/ # Main app pages
src/components/
  assistant-ui/      # AI chat interface
  workspace/         # Workspace canvas and grid
  ui/                # Shadcn components
src/lib/
  ai/tools/          # Individual AI tool implementations
  db/                # Drizzle client, schema, relations, types
  workspace/         # Event sourcing logic
  workspace-state/   # Card type definitions and state helpers
  stores/            # Zustand stores
  auth.ts            # Better Auth server config
  auth-client.ts     # Better Auth client config
```

### Media Processing

- PDFs: OCR via Azure Computer Vision or Gemini
- Images: OCR via Gemini
- Audio: Transcription via Gemini (workflow-based, async)
- YouTube: oEmbed API for metadata + transcripts

### Path Alias

`@/*` maps to `./src/*`.
