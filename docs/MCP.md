# ThinkEx MCP server (v1)

Remote, read-only Model Context Protocol endpoint over ThinkEx workspaces.

## Endpoint

- **URL:** `https://<app-origin>/mcp` (locally `http://localhost:3000/mcp`)
- **Transport:** Streamable HTTP (stateless)
- **Auth:** OAuth 2.1 bearer token with `workspace:read` scope

Clients discover auth via `GET /.well-known/oauth-protected-resource/mcp` (RFC 9728); unauthenticated `/mcp` requests return `401` with a `WWW-Authenticate` header pointing there. Tokens must use the RFC 8707 `resource` parameter `https://<app-origin>/mcp`; only JWTs with that audience are accepted (opaque tokens are rejected).

## Adding to a client

Dynamic client registration and consent are enabled, so clients only need the URL.

- **Cursor** (`~/.cursor/mcp.json`) / **Windsurf** (`mcp_config.json`): `{ "mcpServers": { "thinkex": { "url": "https://<app-origin>/mcp" } } }` (Windsurf uses `serverUrl`).
- **VS Code** (`.vscode/mcp.json`): `{ "servers": { "thinkex": { "type": "http", "url": "https://<app-origin>/mcp" } } }`.
- **Claude Desktop:** add as a custom connector under Settings → Connectors.
- **stdio-only clients:** bridge with `npx -y mcp-remote https://<app-origin>/mcp`.

## Tools

Read-only, called in sequence:

1. `thinkex_list_workspaces` — workspaces for the user (id, name, description, role). Get a workspace `id`.
2. `thinkex_workspace_list_items` — items under a `path` (`recursive`, `limit`; paginated). Start at `/`.
3. `thinkex_workspace_read_items` — read specific `paths` with an optional `pages` range (PDF pages for files, 1000-line pages for documents).

Domain failures (path not found, folder read, unsupported type, out-of-range pages, workspace access denied) return as structured `failed` entries, not protocol errors.

## Local development

1. Copy `.dev.vars.example` to `.dev.vars` (or `pnpm dev` with Infisical).
2. `pnpm db:migrate:local` (first run only).
3. `CLOUDFLARE_VITE_FORCE_LOCAL=true pnpm serve:dev`
4. `npx @modelcontextprotocol/inspector`, point it at `http://localhost:3000/mcp` (Streamable HTTP). Sign in (guest or Google) and complete consent when prompted.

Required env vars (in `.dev.vars`, see `docs/ENVIRONMENT.md`):

- `BETTER_AUTH_SECRET` — random 32+ char string; signs sessions and tokens.
- `BETTER_AUTH_URL` — app origin (e.g. `http://localhost:3000`); the OAuth issuer, JWKS host, and `/mcp` token audience.

Google creds are optional; guest sign-in is enough to authorize a client.

## v1 limitations

- **Read-only** — three read tools only; no write tools.
- **No images** — text/Markdown projections only; unsupported types return `status: "unsupported"`.
- **Async PDFs** — `status: "pending"` means extraction isn't ready yet (retry later); `status: "failed"` means extraction failed.
- **No resources or subscriptions** — tools only; no `thinkex://` URIs or change notifications.
- **No rate limiting** on tool calls yet; scope and membership are enforced on every call at the token and operation layers.
- **Audit logging** is structured (`recordMcpToolCall`) but not wired to telemetry yet; actor fields (`userId`, `clientId`, `scopes`) are recorded at each tool invocation for a future issue.
