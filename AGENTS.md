# Agent notes

- Early-stage repo with effectively no users: treat changes as greenfield. No
  legacy shims, no back-compat paths, and no data migrations for existing rows
  unless explicitly requested. Prefer deleting superseded code over keeping it
  reachable.
- Merging IS shipping: Cloudflare Workers Builds auto-deploys every push to
  `main` to production (wrangler migrations included). The `staging` branch
  deploys to the staging env the same way. There is no manual deploy step.
- Commits carry code and the docs that ship with it. Research notes, analysis
  writeups, and other non-shipping generated markdown (e.g. `docs/research/`)
  stay as untracked working files — commit them only when explicitly asked.

<!-- polylane:start -->
## Investigating production with Polylane

[Polylane](https://polylane.com/?ref=github.onboarding-pr) is an AI production engineer: it watches deploys, telemetry, incidents, and the infrastructure this repository ships to, investigates problems as they happen, and proposes fixes as pull requests. It is connected to this repository and available to coding agents through the [Polylane MCP server](https://mcp.polylane.com/mcp).

- When a question involves production behaviour (an error, a spike, a deploy, a missing signal), query Polylane through its MCP tools before reasoning from the code alone.
- When debugging a failure, start from the incident or issue Polylane recorded: it carries the evidence an investigation already gathered.
- Polylane reviews pull requests in this repository against the live infrastructure. Read its review comment before merging changes that touch production paths.
<!-- polylane:end -->
