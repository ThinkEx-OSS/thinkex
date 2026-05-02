<p align="center">
  <a href="https://thinkex.app">
    <img alt="ThinkEx" src="public/readmelogo.svg" width="500" />
  </a>
</p>

<p align="center">
  <a href="https://thinkex.app">Try ThinkEx</a> · <a href="#features">Features</a> · <a href="#self-hosting">Self-Host</a> · <a href="#contributing">Contribute</a>
</p>

## The Problem

Today's apps and AI split what should be a single, fluid process: AI reasoning happens in isolated chat threads, while your information is scattered across tabs and windows.

**This split prevents knowledge from compounding.** Each conversation starts from scratch. Insights don't connect to your existing work. You can't build on past thinking. Valuable insights get buried in chat history, and you find yourself explaining the same context repeatedly. Information disappears into logs you never revisit.

ThinkEx solves this by making context explicit, organized, and persistent.

## What is ThinkEx?

ThinkEx is a visual thinking environment where notes, media, and AI conversations compound into lasting knowledge.

Think of a large desk where you spread out textbooks, notes, and papers to work. You look back and forth, connecting dots, comparing sources, and asking questions. ThinkEx brings that desk to your browser, where AI can help alongside you.

1.  **See Everything**: Bring PDFs, videos, and notes onto a visual canvas. Organize them spatially to make sense of the information.
2.  **Compare Sources**: Look across your sources side-by-side. Spot patterns and contradictions that only emerge when everything is visible.
3.  **Targeted Reasoning**: Select specific items on your desk for the AI to analyze. Point to a note and a paragraph and ask for the connection.
4.  **Capture Insights**: Extract findings into structured knowledge that become part of your permanent workspace.

## Features

*   **User-Controlled Context**: Manually select exact cards, notes, or document sections for the AI. No opaque retrieval mechanisms.
*   **Spatial Canvas**: Arrange notes, PDFs, videos, and chat side-by-side.
*   **First-Class Media**: Native PDF viewing with highlights; YouTube videos with transcript-backed context.
*   **Persistent Knowledge**: Saved cards (notes, flashcards, references) remain in your workspace.
*   **Multi-Model**: Switch AI models per task without locking into a single provider.
*   **Sharing**: Share or export workspaces with others

## Why Existing Tools Fall Short

| Approach          | Examples                 | What It Loses                                     |
| :---------------- | :----------------------- | :------------------------------------------------ |
| Chat-First        | ChatGPT, Gemini, Claude  | Insights vanish into endless scroll and context resets every conversation. |
| Notes-First       | Notion, Obsidian         | AI is bolted on and isolated from your info.     |
| Retrieval-First   | NotebookLM              | Sources are trapped behind the interface where you can't see or work with them. |

### ThinkEx is different

Nothing disappears into a black box. You see what AI sees and control what it works with. And it's open source, so you get full transparency, no model lock-in, and a product driven by the community.

## Tech Stack

*   **Framework**: [Next.js](https://nextjs.org/)
*   **Styling**: [Tailwind CSS](https://tailwindcss.com/), [Shadcn UI](https://ui.shadcn.com/)
*   **Database**: [PostgreSQL](https://github.com/postgres/postgres) with [Drizzle ORM](https://orm.drizzle.team/)
*   **State**: [TanStack Query](https://tanstack.com/query/latest), [Zustand](https://github.com/pmndrs/zustand)
*   **Auth**: [Better Auth](https://www.better-auth.com/)

## Self-Hosting

ThinkEx supports a **core self-host** path for local development:

- PostgreSQL
- Better Auth secret + app URL
- Zero cache server
- Local filesystem storage

`pnpm dev` is the supported one-command entrypoint for this setup. It starts:

- Next.js
- the AI SDK devtools
- Zero

### Quick Start

```bash
git clone https://github.com/ThinkEx-OSS/thinkex.git
cd thinkex
./setup.sh
pnpm dev
```

Access ThinkEx at [http://localhost:3000](http://localhost:3000).

### What Core Self-Host Includes

- Local uploads, viewing, and deletion using `STORAGE_TYPE=local`
- Workspace sync through Zero
- The main app shell and workspace flows

### What Core Self-Host Does Not Include

OCR, audio transcription, and office document conversion require provider-reachable object storage plus the relevant provider credentials. Those features are intentionally not supported in local-file core mode and will fail with explicit messages.

### Full Setup Guide

See [SELF_HOSTING.md](SELF_HOSTING.md) for:

- required local environment variables
- Zero configuration
- local storage behavior
- optional integrations such as Supabase, OCR, audio, analytics, and email

## Contributing

We welcome contributions.

1.  Fork the repository.
2.  Create a feature branch: `git checkout -b feature/new-feature`
3.  Commit changes: `git commit -m 'Add new feature'`
4.  Push to branch: `git push origin feature/new-feature`
5.  Open a Pull Request.

See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## License

This project is licensed under the [AGPL-3.0 License](LICENSE).
