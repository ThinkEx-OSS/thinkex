<p align="center">
  <a href="https://thinkex.app">
    <img alt="ThinkEx" src="public/newreadmeimage.svg" width="500" />
  </a>
</p>

<p align="center">
  <a href="https://thinkex.app">Try ThinkEx</a> · <a href="#features">Features</a> · <a href="#self-hosting">Self-Host</a> · <a href="#contributing">Contribute</a>
</p>

## The Problem

AI needs context to think well, and humans need space to think well. Current tools split these functions: reasoning happens in chat logs, while information lives in scattered documents.

As a result, valuable reasoning gets buried in chat history. You find yourself explaining the same context repeatedly, and insights disappear into logs you never revisit.

ThinkEx solves this by making context explicit, structured, and persistent.

## What is ThinkEx?

Think of a large desk where you spread out textbooks, notes, and papers to study. You look back and forth, connecting dots and comparing sources.

ThinkEx is that desk, digitalized for the browser.

1.  **See Everything**: Bring PDFs, videos, and notes onto a visual canvas. Organize them spatially to make sense of the information.
2.  **Compare Sources**: Look across your sources side-by-side. Spot patterns and contradictions that only emerge when everything is visible.
3.  **Targeted Reasoning**: Select specific items on your desk for the AI to analyze. Point to a note and a paragraph and ask for the connection.
4.  **Capture Insights**: Extract findings into structured cards that become part of your permanent workspace.

## Features

*   **User-Controlled Context**: Manually select exact cards, notes, or document sections for the AI. No opaque retrieval mechanisms.
*   **Spatial Canvas**: Arrange notes, PDFs, videos, and chat side-by-side.
*   **First-Class Media**: Native PDF viewing with highlights; YouTube videos with transcript-backed context.
*   **Persistent Knowledge**: Saved cards (notes, flashcards, references) remain in your workspace.
*   **Multi-Model**: Switch AI models per task without locking into a single provider.
*   **Sharing**: Share or export workspaces with all context preserved.

## Why Existing Tools Fall Short

| Approach          | What It Does             | What It Loses                                     |
| :---------------- | :----------------------- | :------------------------------------------------ |
| **ThinkEx**       | **Integrated Reasoning** | --                                                |
| Chat-first tools  | Powerful reasoning       | Memory (context vanishes in logs)                 |
| Notes-first tools | Organization             | Reasoning (AI is not deeply integrated)           |
| RAG systems       | Auto-retrieval           | Control (you can't see/adjust selection)          |
| Long-context      | More tokens              | Understanding (coherence doesn't scale with size) |

## Tech Stack

*   **Framework**: [Next.js](https://nextjs.org/)
*   **Styling**: [Tailwind CSS](https://tailwindcss.com/), [Shadcn UI](https://ui.shadcn.com/)
*   **Database**: [PostgreSQL](https://github.com/postgres/postgres) with [Drizzle ORM](https://orm.drizzle.team/)
*   **State**: [TanStack Query](https://tanstack.com/query/latest), [Zustand](https://github.com/pmndrs/zustand)
*   **Auth**: [Better Auth](https://www.better-auth.com/)

## Self-Hosting

Follow these steps to run ThinkEx on your own infrastructure.

### Prerequisites

*   Node.js (v20+)
*   pnpm
*   PostgreSQL database (local or hosted like Supabase/Neon)

### Installation

1.  **Clone the repository**
    ```bash
    git clone https://github.com/ThinkEx-OSS/thinkex.git
    cd thinkex
    ```

2.  **Install dependencies**
    ```bash
    pnpm install
    ```

3.  **Environment Setup**
    Create the local environment file:
    ```bash
    cp .env.example .env.local
    ```
    
    Open `.env.local` and configure the following:
    
    *   **Database**:
        *   `DATABASE_URL`: PostgreSQL connection string.
        *   `NEXT_PUBLIC_SUPABASE_URL`: Your Supabase project URL.
        *   `SUPABASE_SERVICE_ROLE_KEY`: Service role key from Supabase dashboard.
    *   **Auth**:
        *   `BETTER_AUTH_SECRET`: Generate a random string (e.g., `openssl rand -base64 32`).
    *   **AI**:
        *   `GOOGLE_GENERATIVE_AI_API_KEY`: API key for Google Gemini.
    *   **Google OAuth** (for login):
        *   `GOOGLE_CLIENT_ID`
        *   `GOOGLE_CLIENT_SECRET`

4.  **Supabase Storage**
    Create a storage bucket for file uploads:
    1.  Go to Supabase Dashboard → Storage.
    2.  Create a new bucket named `file-upload`.
    3.  Set the bucket to **Public**.

5.  **Database Setup**
    Push the schema to your database:
    ```bash
    pnpm db:push
    ```
    *Note: Use `db:setup` if you want to run full migrations, but `db:push` is sufficient for syncing the schema.*

6.  **Run Development Server**
    ```bash
    pnpm dev
    ```
    Access the app at [http://localhost:3000](http://localhost:3000).

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
