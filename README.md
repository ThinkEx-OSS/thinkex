<p align="center">
  <a href="https://thinkex.app">
    <img alt="ThinkEx: Rethinking the User Interface of AI" src="public/newreadmeimage.svg" width="500" />
  </a>
</p>

<p align="center">
  <a href="https://thinkex.app">Try ThinkEx</a> · <a href="#what-is-thinkex">What is ThinkEx?</a> · <a href="#features">Features</a> · <a href="#self-hosting">Self-Host</a> · <a href="#contributing">Contribute</a>
</p>



## The Problem

AI needs relvant context to think well. <br>
Humans need the right environmentto think well. <br>
**Today, no single platform supports both.**

Valuable reasoning disappears into chat logs. You explain the same context again and again. Insights that could have been breakthroughs last week are now buried in scroll history across conversations you’ll never revisit.

The intelligence is there, but your **information collapses over time**.

Current tools split what should be unified:
- **Reasoning** happens in AI chats
- **Memory** lives in notes and documents
- **Organization** is scattered across folders and tabs

> **Context should be explicit, structured, persistent, and user-controlled**. Not implicit inside a prompt or hidden in vector space.

ThinkEx was built around this insight.

## What is ThinkEx?



Think of a large physical desk. When you're deeply studying or working on a project, you spread everything out: textbook on the left, notebook in the middle, research paper on the right. You look back and forth, comparing them, connecting dots in your head.

**ThinkEx is that desk, digitalized.**

1. **See Everything:** Bring your PDFs, videos, and notes onto a visual canvas. Organize them spatially so *you* can make sense of the mess.

2. **Compare & Contrast:** Look across your sources. See how Source A contradicts Source B. Spot patterns that only emerge when everything is visible.

3. **Targeted AI Support:** Select specific items on your desk and say, "Look at *this* note and *this* paragraph—help me understand the connection."

4. **Capture & Persist:** Extract valuable insights into structured cards that become part of your permanent workspace, available for future reasoning.

### Who It’s For

- Students working across many sources  
- Researchers comparing papers  
- Writers and analysts building long-term understanding  
- Anyone tired of re-explaining the same context to AI

## Features

- **Context you control**: Hand-pick the exact cards/notes/document sections the AI can use (no “guessy” retrieval).
- **Spatial canvas**: Arrange notes, PDFs, videos, and chat side-by-side to spot connections and compare sources.
- **First-class documents**: Native PDF viewing with highlights/annotations; add YouTube with transcript-backed context.
- **Knowledge that persists**: Capture what you need and  turn into structured cards (notes, flashcards, references) that live on your workspace.
- **Multi-model**: Switch models per task without locking your workspace to a single provider.
- **Share & collaborate**: Share/export workspaces or specific items with context preserved.


## Why Existing Tools Fall Short

| Approach | What It Does | What It Loses |
|----------|--------------|---------------|
| **Chat-first tools** (ChatGPT, Claude) | Powerful reasoning | Memory—everything vanishes into logs |
| **Notes-first tools** (Notion, Obsidian) | Good organization | Reasoning—AI is bolted on, not integrated |
| **RAG systems** | Automatic context retrieval | Control—you can't see or adjust what's selected |
| **Long-context windows** | More tokens | Understanding—scaling context ≠ scaling coherence |

## Tech Stack

*   **Framework:** [Next.js](https://nextjs.org/)
*   **Styling:** [Tailwind CSS](https://tailwindcss.com/), [Shadcn UI](https://ui.shadcn.com/)
*   **Database:** [PostgreSQL](https://github.com/postgres/postgres) with [Drizzle ORM](https://orm.drizzle.team/)
*   **State & Data:** [TanStack Query](https://tanstack.com/query/latest), [Zustand](https://github.com/pmndrs/zustand)


## Self-Hosting

Want to run ThinkEx on your own infrastructure?

### Prerequisites

*   Node.js (v20+)
*   pnpm
*   PostgreSQL database (local or hosted like Supabase/Neon)

### Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/ThinkEx-OSS/thinkex.git
    cd thinkex
    ```

2.  **Install dependencies:**
    ```bash
    pnpm install
    ```

3.  **Environment Setup:**
    ```bash
    cp .env.example .env.local
    ```
    Configure your keys:
    *   `DATABASE_URL` – Your PostgreSQL connection string
    *   `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` – For authentication
    *   AI provider keys (e.g., `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`)

4.  **Database Setup:**
    ```bash
    pnpm db:push
    ```

5.  **Run the development server:**
    ```bash
    pnpm dev
    ```

    Open [http://localhost:3000](http://localhost:3000) to see the app.

## Contributing

We welcome contributions! Whether it's bug fixes, new features, or documentation improvements.

1.  Fork the repository
2.  Create your feature branch: `git checkout -b feature/amazing-feature`
3.  Commit your changes: `git commit -m 'Add some amazing feature'`
4.  Push to the branch: `git push origin feature/amazing-feature`
5.  Open a Pull Request

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines.


## Acknowledgments

ThinkEx is built on incredible open-source projects:
*   [Assistant UI](https://www.assistant-ui.com/) – AI chat components
*   [EmbedPDF](https://embedpdf.com/) – PDF rendering
*   [BlockNote](https://blocknotejs.org/) – Block-based editor
*   [Better Auth](https://www.better-auth.com/) & [Better Auth UI](https://better-auth-ui.com/) – Authentication
*   [React Grid Layout](https://github.com/react-grid-layout/react-grid-layout) – Canvas layout system



## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
