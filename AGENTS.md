# Agent notes

- Early-stage repo with effectively no users: treat changes as greenfield. No
  legacy shims, no back-compat paths, and no data migrations for existing rows
  unless explicitly requested. Prefer deleting superseded code over keeping it
  reachable.
- Merging IS shipping: Cloudflare Workers Builds auto-deploys every push to
  `main` to production (wrangler migrations included). The `staging` branch
  deploys to the staging env the same way. There is no manual deploy step.
