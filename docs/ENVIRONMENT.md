# Environment

ThinkEx reads runtime config from Cloudflare bindings, environment variables, and local `.dev.vars` files. Infisical is the shared secret source.

## Local Development

Use `pnpm dev` for normal local development. It injects Infisical `dev:/app` secrets and starts the dev server.

Use `pnpm serve:dev` when the environment is already present, such as after a cloud setup script writes `.dev.vars`.

## Secret Paths

| Path | Purpose |
| --- | --- |
| `dev:/app` | Normal local developer secrets |
| `dev:/agents` | Sandbox secrets for hosted agent/dev-server environments |

Cloud agents should not receive production credentials, deploy tokens, migration tokens, or legacy database credentials unless a task explicitly requires them.

## Runtime Sync

Cloudflare Worker secrets are synced from Infisical for deployed environments. Local and hosted-agent dev servers should use Infisical-injected variables or a generated, gitignored `.dev.vars` file.

Auth uses `BETTER_AUTH_URL` as the canonical app origin. Cloud-agent or preview dev servers with changing hosts can set `BETTER_AUTH_ALLOWED_HOSTS`, for example `localhost:*,127.0.0.1:*`.

## Agent Authentication

The product login UI currently sends users through Google. Hosted agents that need a session can use the Better Auth anonymous endpoint directly against a dev server:

```bash
curl -i -c .auth.cookies -b .auth.cookies -X POST \
  "$APP_ORIGIN/api/auth/sign-in/anonymous"
```

Reuse the same cookie jar for follow-up requests that need the anonymous session. Anonymous auth is installed for automation and future onboarding work; it is not a visible end-user sign-in option.
