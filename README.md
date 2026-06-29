# ThinkEx

ThinkEx is a workspace for thinking across notes, documents, media, and AI in one place.

ThinkEx is built around persistent workspaces instead of disposable chat threads. You can lay out sources side by side, organize them spatially, ask questions against specific context, and keep the resulting knowledge inside the workspace instead of losing it in chat history.

## Overview

This repository contains the current ThinkEx web app. It is built with React and TanStack Start and deployed on Cloudflare Workers.

At a high level, the app combines:

- a browser-based workspace UI
- first-class documents and media
- AI-assisted reasoning inside the workspace
- collaboration and sharing
- storage, workflows, and realtime infrastructure on Cloudflare

## What ThinkEx Does

ThinkEx is aimed at research, synthesis, and knowledge work where context matters.

- Work in persistent workspaces instead of one-off chats.
- Put notes, PDFs, and other artifacts next to each other.
- Ask the AI about the exact context you selected.
- Save outputs back into the workspace as part of the ongoing work.
- Share workspaces with collaborators.

## Tech Stack

- React 19
- TanStack Start, Router, and Query
- TypeScript
- Tailwind CSS
- Better Auth
- Drizzle ORM
- Vite+
- Tiptap for rich text editing
- Yjs / PartyServer for collaborative document state
- EmbedPDF / PDFium for PDF rendering
- Cloudflare Workers
- Cloudflare D1
- Cloudflare R2
- Cloudflare Durable Objects
- Cloudflare Workflows
- Cloudflare Containers
- Cloudflare Email

## Local Development

```bash
pnpm install
pnpm dev
```

The app runs at [http://localhost:3000](http://localhost:3000).

Local development expects secrets through Infisical.

Common commands:

- `pnpm dev`
- `pnpm test`
- `pnpm check`
- `pnpm build`

## Deployment Model

The repository currently targets local development, staging, and production. Deployment is handled through GitHub Actions and Wrangler. Database changes flow through Drizzle-generated SQL plus Wrangler D1 migrations. Cloudflare Containers run the Gotenberg-based `OfficePdfConverter` used for office-to-PDF conversion.

## Repository

- `src/features/workspaces/` contains most of the product-specific logic.
- `src/integrations/` contains external service integrations such as PostHog.
- `drizzle/` contains the current database migration baseline.
- `wrangler.jsonc` is the main Cloudflare runtime config.
