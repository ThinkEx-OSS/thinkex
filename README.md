<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/thinkex-filled-ascii-wordmark-dark.svg">
    <source media="(prefers-color-scheme: light)" srcset="docs/assets/thinkex-filled-ascii-wordmark-light.svg">
    <img alt="ThinkEx" src="docs/assets/thinkex-filled-ascii-wordmark-light.svg" width="430">
  </picture>
</p>

<p align="center">
  <a href="https://github.com/ThinkEx-OSS/thinkex/stargazers"><img alt="GitHub stars" src="https://shieldcn.dev/github/stars/ThinkEx-OSS/thinkex.svg?variant=secondary&size=sm&theme=amber"></a>
  <a href="https://docs.thinkex.app"><img alt="Docs" src="https://shieldcn.dev/badge/Docs-18E299.svg?variant=secondary&size=sm&logo=book-open"></a>
  <a href="https://x.com/trythinkex"><img alt="X" src="https://shieldcn.dev/badge/X-follow-000000.svg?variant=secondary&size=sm&logo=x"></a>
  <a href="https://discord.gg/dtPnzkqCcG"><img alt="Discord" src="https://shieldcn.dev/badge/Discord-join-5865f2.svg?variant=secondary&size=sm&logo=discord"></a>
</p>

<p align="center">
  <strong>The workspace built for how you study, research, and create.</strong>
</p>

<p align="center">
  <img alt="ThinkEx workspace with documents, folders, and AI assistant" src="docs/assets/landing-workspace-screenshot.webp" width="900">
</p>

## When a Chat Thread Is Not Enough

ThinkEx is a workspace for source-heavy study and research.

Instead of uploading sources into a chat, you keep the actual materials in view: PDFs, docs, images, folders, and AI chat. Arrange them, pick what the AI should use as context, and keep the work grounded in your actual materials.

- Open PDFs, documents, images, and folders in a workspace.
- Put sources side by side while you read or compare them.
- Ask AI about the specific items you choose.
- Share a workspace with collaborators (fellow humans).

## How It Is Different

| Compared with           | What they are good at                    | Where ThinkEx differs                                     |
| ----------------------- | ---------------------------------------- | --------------------------------------------------------- |
| ChatGPT, Claude, Gemini | Fast AI conversations                    | Chat is part of the workspace, next to sources and docs   |
| NotebookLM              | Asking questions over uploaded sources   | Sources stay open, arrangeable, editable, and shareable   |
| Obsidian                | Markdown files and local knowledge bases | PDFs, images, docs, AI chat, and sharing are first-class  |
| Google Drive, Dropbox   | Storing and sharing files                | Files become source material with docs and AI beside them |

## Built On

ThinkEx is a full-stack TypeScript app hosted on Cloudflare. The frontend is React, TanStack Start, Tailwind CSS, Tiptap, EmbedPDF/PDFium, Yjs, and AI SDK. The backend runs on Cloudflare Workers with Durable Objects, D1, R2, Workflows, Containers, Workers AI, Browser Rendering, and Email.

<details>
<summary>Tech stack</summary>

### Cloudflare

- **Workers** for the application server.
- **Durable Objects** for workspace, document, AI, sandbox, and conversion coordination.
- **D1** for relational app data with Drizzle migrations.
- **R2** for workspace file storage.
- **Workflows** for file extraction.
- **Containers** for code execution, office conversion, and image conversion.
- **Workers AI** and **AI Gateway** for model access.
- **Browser Rendering** for web browsing workflows.
- **Email** for workspace invites.
- **Observability** for logs, traces, and source maps.
- **Wrangler**, **Cloudflare Vite plugin**, and **Workers Vitest pool** for local runtime, deploys, types, and tests.

### App and UI

- **React 19**, **TanStack Start/Router/Query**, **TypeScript**, **Vite+**, and **Tailwind CSS v4**.
- **Base UI**, **lucide-react**, **motion**, **sonner**, and local shadcn-style components.
- **Tiptap 3**, **ProseMirror**, **Yjs**, **y-partyserver**, and **PartyServer** for collaborative documents.
- **EmbedPDF**, **PDFium**, **Photon**, **Gotenberg**, and image conversion containers for rich source handling.

### AI, data, and product systems

- **AI SDK**, **Cloudflare Think**, **Cloudflare Sandbox**, **Cloudflare Shell**, and **Cloudflare Codemode**.
- **Better Auth**, **Drizzle ORM**, **Zod**, **PostHog**, **The Context Company**, **Autumn**, **Firecrawl**, and **LlamaCloud** integrations.
- **Streamdown**, **KaTeX**, **Shiki**, **PapaParse**, **dnd-kit**, **react-resizable-panels**, and **Zustand** for workspace interactions.

See [`package.json`](package.json), [`wrangler.jsonc`](wrangler.jsonc), and [`docs/ENVIRONMENT.md`](docs/ENVIRONMENT.md) for deeper implementation details.

</details>

## Supporters

Programs and platforms supporting ThinkEx with credits, tools, and infrastructure.

<p align="center">
  <a href="https://capy.ai/"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/supporters/capy-wordmark-dark.svg"><source media="(prefers-color-scheme: light)" srcset="docs/assets/supporters/capy-wordmark-light.svg"><img alt="Capy" src="docs/assets/supporters/capy-wordmark-light.svg" height="42"></picture></a>
  &nbsp;&nbsp;&nbsp;&nbsp;
  <a href="https://www.greptile.com/"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/supporters/greptile-wordmark-green.svg"><source media="(prefers-color-scheme: light)" srcset="docs/assets/supporters/greptile-wordmark-green.svg"><img alt="Greptile" src="docs/assets/supporters/greptile-wordmark-green.svg" height="42"></picture></a>
  &nbsp;&nbsp;&nbsp;&nbsp;
  <a href="https://www.thecontextcompany.com/"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/supporters/the-context-company-wordmark-dark.svg"><source media="(prefers-color-scheme: light)" srcset="docs/assets/supporters/the-context-company-wordmark-light.svg"><img alt="The Context Company" src="docs/assets/supporters/the-context-company-wordmark-light.svg" height="42"></picture></a>
</p>

<p align="center">
  <a href="https://posthog.com/"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/supporters/posthog-wordmark-dark.svg"><source media="(prefers-color-scheme: light)" srcset="docs/assets/supporters/posthog-wordmark-light.svg"><img alt="PostHog" src="docs/assets/supporters/posthog-wordmark-light.svg" height="42"></picture></a>
  &nbsp;&nbsp;&nbsp;&nbsp;
  <a href="https://mintlify.com/"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/supporters/mintlify-wordmark-dark.svg"><source media="(prefers-color-scheme: light)" srcset="docs/assets/supporters/mintlify-wordmark-light.svg"><img alt="Mintlify" src="docs/assets/supporters/mintlify-wordmark-light.svg" height="42"></picture></a>
  &nbsp;&nbsp;&nbsp;&nbsp;
  <a href="https://www.coderabbit.ai/"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/supporters/coderabbit-wordmark-dark.svg"><source media="(prefers-color-scheme: light)" srcset="docs/assets/supporters/coderabbit-wordmark-light.svg"><img alt="CodeRabbit" src="docs/assets/supporters/coderabbit-wordmark-light.svg" height="42"></picture></a>
</p>

## Contributing

If you want to run or contribute the ThinkEx web app, start with:

- [`CONTRIBUTING.md`](CONTRIBUTING.md) for contribution expectations.
- [`docs/ENVIRONMENT.md`](docs/ENVIRONMENT.md) for local setup.
