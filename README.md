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

| Compared with                | What they are good at                    | Where ThinkEx differs                                     |
| ---------------------------- | ---------------------------------------- | --------------------------------------------------------- |
| ChatGPT, Claude, Gemini      | Fast AI conversations                    | Chat is part of the workspace, next to sources and docs   |
| Gemini Notebook (NotebookLM) | Asking questions over uploaded sources   | Sources stay open, arrangeable, editable, and shareable   |
| Obsidian                     | Markdown files and local knowledge bases | PDFs, images, docs, AI chat, and sharing are first-class  |
| Google Drive, Dropbox        | Storing and sharing files                | Files become source material with docs and AI beside them |

## Built On

ThinkEx is a full-stack TypeScript app hosted on Cloudflare. The frontend is React, TanStack Start, Tailwind CSS, Tiptap, EmbedPDF/PDFium, Yjs, and AI SDK. The backend runs on Cloudflare Workers with Durable Objects, PlanetScale Postgres through Hyperdrive, R2, Workflows, Containers, Workers AI, Images, Browser Run, and Email.

<details>
<summary>Tech stack</summary>

### Cloudflare

- **Workers** for the application server.
- **Durable Objects** for realtime workspace, document, AI, sandbox, and conversion coordination.
- **PlanetScale Postgres** for relational and canonical workspace state, accessed through cache-disabled Hyperdrive and managed with Drizzle migrations.
- **R2** for binary workspace file storage, with presigned direct uploads over `aws4fetch`.
- **Workflows** for file extraction.
- **Containers** for code execution (Sandbox), office conversion (Gotenberg), and file processing (LiteParse).
- **Workers AI** and **AI Gateway** for model access.
- **Images** for image transforms and conversion.
- **Worker Loaders** for dynamic code execution behind Codemode.
- **Browser Run** for page reads, agent-driven CDP sessions, Live View, and human handoff.
- **Email** for workspace invites.
- **Observability** for logs, traces, and source maps.
- **Wrangler**, **Cloudflare Vite plugin**, and **Workers Vitest pool** for local runtime, deploys, types, and tests.

### App and UI

- **React 19**, **TanStack Start/Router/Query**, **TypeScript**, **Vite+**, and **Tailwind CSS v4**.
- **Base UI**, **lucide-react**, **motion**, **sonner**, and local shadcn-style components.
- **Tiptap 3**, **ProseMirror**, **Yjs**, **y-partyserver**, and **PartyServer** for collaborative documents.
- **EmbedPDF**, **PDFium**, **Gotenberg**, and **LiteParse** for rich source handling.
- **Content Collections** for the Markdown-backed blog.

### AI, data, and product systems

- **AI SDK**, **Cloudflare Think**, **Cloudflare Sandbox**, **Cloudflare Shell**, **Cloudflare Codemode**, and **Cloudflare Agents**.
- **MCP** via the **Model Context Protocol SDK** and **Better Auth OAuth provider**, so agents can drive workspaces.
- **Better Auth**, **Drizzle ORM**, **Zod**, **PostHog** (product analytics and LLM analytics), **The Context Company**, **Autumn** (plans, usage, and billing), **Firecrawl**, and **LlamaCloud** integrations.
- **Streamdown**, **KaTeX**, **Shiki**, **PapaParse**, **dnd-kit**, **react-resizable-panels**, and **Zustand** for workspace interactions.

### Toolchain

- **pnpm**, **Node 24**, and **Vite+** (`vp`) for dependency management, dev, build, lint, format, and test.
- **Vitest** with a browser-free node project and a **Workers** pool project.
- **Infisical** for shared secrets, **Drizzle Kit** for migrations, **knip** and **react-doctor** for dead code and React checks, and **commitlint** for conventional commits.

See [`package.json`](package.json), [`wrangler.jsonc`](wrangler.jsonc), and [`docs/ENVIRONMENT.md`](docs/ENVIRONMENT.md) for deeper implementation details.

</details>

## Supporters

Programs and platforms supporting ThinkEx with credits, tools, and infrastructure.

<p align="center">
  <a href="https://capy.ai/"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/supporters/capy-wordmark-dark.svg"><source media="(prefers-color-scheme: light)" srcset="docs/assets/supporters/capy-wordmark-light.svg"><img alt="Capy" src="docs/assets/supporters/capy-wordmark-light.svg" height="42"></picture></a>
  &nbsp;&nbsp;&nbsp;&nbsp;
  <a href="https://www.greptile.com/?utm_source=oss_badge&utm_medium=readme&utm_campaign=greptile_for_open_source"><img alt="Greptile: The War on Bugs" src="https://www.greptile.com/badge.svg" width="300"></a>
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

If you want to run or contribute to the ThinkEx web app, start with:

- [`CONTRIBUTING.md`](CONTRIBUTING.md) for contribution expectations.
- [`docs/ENVIRONMENT.md`](docs/ENVIRONMENT.md) for local setup.
