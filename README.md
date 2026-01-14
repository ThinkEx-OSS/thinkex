<p align="center">
  <a href="https://thinkex.app">
    <img alt="ThinkEx: Rethinking the User Interface of AI" src="public/newreadmeimage.svg" width="500" />
  </a>
</p>

Today’s AI chat interfaces make long-term and complex work frustrating: context gets lost, ideas scatter, and information overload builds over time. ThinkEx raises the standard with a flexible workspace designed to capture what's relevant, organize knowledge, and use AI without losing control.


## Tech Stack

*   **Framework:** [Next.js](https://nextjs.org/)
*   **Styling:** [Tailwind CSS](https://tailwindcss.com/), [Shadcn UI](https://ui.shadcn.com/)
*   **Database:** [PostgreSQL](https://github.com/postgres/postgres) with [Drizzle ORM](https://orm.drizzle.team/)
*   **State & Data:** [TanStack Query](https://tanstack.com/query/latest), [Zustand](https://github.com/pmndrs/zustand)


## Self-Hosting

Want to run ThinkEx on your own infrastructure? Follow these steps.

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
s
*   [Assistant UI](https://www.assistant-ui.com/) – AI chat components
*   [EmbedPDF](https://embedpdf.com/) – PDF rendering
*   [BlockNote](https://blocknotejs.org/) – Block-based editor
*   [Better Auth](https://www.better-auth.com/) & [Better Auth UI](https://better-auth-ui.com/) – Authentication
*   [React Grid Layout](https://github.com/react-grid-layout/react-grid-layout) – Canvas layout system



## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
