# ThinkEx

Today’s AI chat interfaces make long-term and complex work frustrating: context gets lost, ideas scatter, and information overload builds over time. ThinkEx raises the standard with a flexible workspace designed to capture what's relevant, organize knowledge, and use AI without losing control.

Head over to [thinkex.app](https://thinkex.app) to start using ThinkEx right away, no setup required.

## Tech Stack

*   **Framework:** [Next.js](https://nextjs.org/)
*   **Styling:** [Tailwind CSS](https://tailwindcss.com/), [Shadcn UI](https://ui.shadcn.com/)
*   **Database:** PostgreSQL with [Drizzle ORM](https://orm.drizzle.team/)
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
    git clone https://github.com/yourusername/thinkex.git
    cd thinkex
    ```

2.  **Install dependencies:**
    ```bash
    pnpm install
    ```

3.  **Environment Setup:**
    Duplicate the example environment file and configure your keys.
    ```bash
    cp .env.example .env.local
    ```
    *   Add your `DATABASE_URL`
    *   Add your `GOOGLE_CLIENT_ID` / `SECRET` (for Auth)
    *   Add your AI API keys (e.g., `GOOGLE_GENERATIVE_AI_API_KEY`)

4.  **Database Setup:**
    Push the schema to your database.
    ```bash
    pnpm db:push
    ```

5.  **Run the development server:**
    ```bash
    pnpm dev
    ```

    Open [http://localhost:3000](http://localhost:3000) to see the app.

## Contributing

We welcome contributions! Please follow these steps:

1.  Fork the repository.
2.  Create your feature branch: `git checkout -b feature/amazing-feature`.
3.  Commit your changes: `git commit -m 'Add some amazing feature'`.
4.  Push to the branch: `git push origin feature/amazing-feature`.
5.  Open a Pull Request.

## Acknowledgments

Special thanks to the following open-source projects that power key features of ThinkEx:

*   [Assistant UI](https://www.assistant-ui.com/)
*   [EmbedPDF](https://embedpdf.com/)
*   [BlockNote](https://blocknotejs.org/)
*   [Better Auth](https://www.better-auth.com/) & [Better Auth UI](https://better-auth-ui.com/)
*   [React Grid Layout](https://github.com/react-grid-layout/react-grid-layout)
  
## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
