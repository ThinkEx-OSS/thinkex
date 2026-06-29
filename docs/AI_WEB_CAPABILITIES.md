# AI Web Capabilities

This note summarizes the web access options for the ThinkEx chat agent. It is a deliberation document, not an implementation spec. The goal is to keep the next architecture discussion grounded in the tradeoffs between plain network tools, Browser Run Quick Actions, full browser automation, MCP, webhooks, and workspace import flows.

## Current State

ThinkEx currently uses `AIThread extends Think` for durable streaming chat and exposes a small workspace-aware tool surface. The agent should not receive unrestricted network or browser access. Web access should happen through named, logged, policy-checked tools so the UI can show tool cards, the inspector can record inputs and outputs, and workspace writes can stay behind `WorkspaceKernel` commands.

Implemented in the current branch:

- `wrangler.jsonc` defines a `BROWSER` binding.
- The compatibility date is set to `2026-03-24`, which is the `env.BROWSER.quickAction()` requirement.
- `AIThread` exposes `web_search`, `web_markdown`, `web_links`, `research_discover`, and `research_deepen`.
- `@cloudflare/codemode` and `worker_loaders` are not installed/configured, which means full CDP/browser tools should wait.

## Options

### Plain Fetch Tool

Use a normal server-side AI SDK `tool()` returned from `AIThread.getTools()`. The tool's `execute` function calls Worker `fetch()`.

Good for:

- JSON APIs
- RSS or Atom feeds
- static markdown/text files
- raw GitHub files
- simple HTML where content is already in the initial response
- status/header/content-type checks
- cheap link existence probes

Pros:

- Fastest and cheapest option.
- No new Cloudflare bindings.
- Easy to secure with URL validation, response limits, redirect limits, and timeouts.
- Best fit for machine-readable resources.

Cons:

- Misses JavaScript-rendered content.
- Cannot capture screenshots or PDFs.
- Cannot inspect the final rendered DOM.

Recommended initial tool:

- `web_fetch_url`: fetch a public HTTP(S) resource and return compact text plus metadata.

Guardrails:

- Allow only `http:` and `https:`.
- Block IP-literal hosts, single-label hosts, localhost-like names, and internal host suffixes.
- Revalidate every redirect target.
- Limit redirects.
- Limit bytes read.
- Use aggressive timeouts.
- Return text/metadata only.
- No POST or side-effectful methods in the first version.

### Browser Run Quick Actions

Use the Browser Run `quickAction()` method on the Worker browser binding. This is not open-ended browser control; it exposes specific browser-produced outputs.

Available action categories:

- rendered HTML/content
- screenshots
- PDFs
- markdown conversion
- HTML plus screenshot snapshots
- CSS selector scraping
- AI-assisted structured JSON extraction
- link extraction
- crawls

Good for:

- JavaScript-heavy pages
- pages where content appears after client rendering
- screenshots
- PDFs
- markdown extraction from rendered pages
- extracting final-DOM links
- structured extraction from ordinary webpages
- documentation or article ingestion

Pros:

- Best balance for ThinkEx web ingestion.
- No Cloudflare API token inside the Worker.
- No `@cloudflare/codemode`.
- No `worker_loaders`.
- Narrower and safer than full CDP tools.
- Good fit for saving rendered page artifacts into the workspace later.

Cons:

- Requires a `BROWSER` binding.
- Requires compatibility date `2026-03-24` or later for `env.BROWSER.quickAction()`.
- Slower and more expensive than plain fetch.
- Crawls need approval, limits, and probably background execution.

Recommended tools:

- `web_search`: find relevant public pages for a topic or question
- `web_markdown`: read a specific public page as bounded Markdown
- `web_links`: extract links from a specific public page
- `research_discover`: find relevant research papers
- `research_deepen`: read relevant passages or find related work for a paper

Later tools:

- `screenshotUrl`: `quickAction("screenshot", { url })`
- `pdfUrl`: `quickAction("pdf", { url })`
- `snapshotUrl`: `quickAction("snapshot", { url })`
- `scrapeUrl`: `quickAction("scrape", { url, selector })`
- `extractUrlJson`: `quickAction("json", { url, prompt, schema })`
- `crawlUrl`: approval-gated crawl into workspace artifacts

### Full Browser Tools / CDP

Think can use browser tools that expose Chrome DevTools Protocol access. The LLM gets tools such as `browser_search` and `browser_execute`, where it writes code that controls a browser session.

Good for:

- DOM inspection
- clicking, typing, and navigating
- debugging frontend pages
- inspecting console/network activity
- performance traces
- complex SPA scraping

Pros:

- Most powerful browser option.
- Useful for debugging and exploratory automation.
- Can handle workflows that Quick Actions cannot express.

Cons:

- Model writes browser-control code.
- Requires `@cloudflare/codemode`.
- Requires `worker_loaders`.
- Harder to secure and explain in product UI.
- Needs strong logging, approval gates, domain policy, and cost limits.

Recommendation:

Do not add this to normal ThinkEx chat yet. Consider it later behind a dev/admin mode or a specific specialist agent once the simpler web ingestion path is stable.

### Playwright, Puppeteer, or Stagehand Tools

Instead of giving the model open-ended CDP tools, ThinkEx can expose product-specific automation tools implemented by us.

Good for:

- known scraping workflows
- pricing-page extraction
- docs crawling
- QA checks
- repeatable website workflows

Pros:

- Safer than arbitrary browser execution.
- Product behavior is predictable.
- Easier to test and document.

Cons:

- More custom code per workflow.
- Less flexible than full browser tools.

Recommendation:

Use this after Quick Actions when a repeated workflow deserves a first-class tool.

### MCP Connectors

MCP is for connecting the agent to external tool servers, not for ordinary page browsing.

Good for:

- GitHub
- Slack
- Linear/Jira
- databases
- documentation search
- internal tools
- remote browser MCP servers

Pros:

- Good long-term integration architecture.
- OAuth-capable.
- Reusable across agents and clients.
- Lets tools live outside the main ThinkEx codebase.

Cons:

- More auth and connection management.
- Needs UI for connection status and scopes.

Recommendation:

Use MCP for product integrations, not as the first general web-reading path.

### Client-Side Tools

Client tools execute in the user's actual browser tab and send results back to the agent.

Good for:

- clipboard
- geolocation
- current app UI state
- selected text
- browser permission-gated actions

Pros:

- Can access user-local/browser-only capabilities.
- User is present, so permissions are natural.

Cons:

- Does not work for unattended background jobs.
- Not appropriate for general crawling or backend ingestion.

Recommendation:

Use for browser-local actions only. Do not use as the primary web ingestion layer.

### Webhooks

Webhooks let external web systems wake the agent or workspace.

Good for:

- GitHub events
- CI/deploy events
- upload completion
- third-party notifications
- async ingest callbacks

Pros:

- Turns web activity into durable workspace events.
- Good fit for server-triggered Think turns via `saveMessages()` or `submitMessages()`.
- Does not require the user to keep chat open.

Cons:

- Requires signature verification.
- Requires routing from external entity to user/workspace/thread.
- Needs clear idempotency.

Recommendation:

Add after basic web reading/import works. Webhooks are important for background workflows, but they are not the first user-facing web capability.

### Push Notifications

Push notifications let an agent notify users when background web work is done or approval is needed.

Good for:

- crawl completed
- monitored page changed
- import failed
- approval needed

Pros:

- Completes the async workflow loop.
- Works after the user closes the tab.

Cons:

- Requires service worker setup.
- Requires VAPID keys.
- Adds notification permission UX.

Recommendation:

Add later, once ThinkEx has long-running web jobs worth notifying about.

## Fetch vs Browser Quick Actions

Use fetch when the resource is already machine-readable.

Examples:

- "Fetch this GitHub API URL."
- "Read this raw markdown file."
- "Summarize this RSS feed."
- "Check whether this link is broken."

Use Browser Quick Actions when the user is asking about a webpage as a user would see it.

Examples:

- "Summarize this rendered article."
- "Screenshot this product page."
- "Extract pricing tiers from this SaaS page."
- "Turn this page into markdown."
- "Get all links from this docs page."

Agent decision rule:

1. Use `readUrl` for APIs, feeds, raw files, and simple public text.
2. If fetch returns thin, empty, script-heavy HTML, use `readWebPage` with the `markdown` action.
3. If the user asks for final DOM links or rendered markdown, use `readWebPage`.
4. If the user asks for screenshot, PDF, structured webpage data, or selector scraping, wait for a dedicated workspace import/extraction tool.
5. If the user asks for many pages or crawling, require approval and use a bounded background job later.

## Recommended Implementation Order

### Phase 1: Safe Web Read

Added narrow tools to `AIThread`:

- `readUrl`
- `readWebPage`

Required config:

- Add `BROWSER` binding.
- Bump compatibility date to at least `2026-03-24`.

Do not add:

- full CDP tools
- `@cloudflare/codemode`
- `worker_loaders`
- broad crawler
- POST/external write tools
- unrestricted generated-code network access

### Phase 2: Workspace Import

Add explicit workspace tools that turn web outputs into user-visible workspace artifacts through `WorkspaceKernel`.

Examples:

- import rendered markdown as a document item
- attach screenshot as an asset
- store source URL and fetched-at metadata
- create a folder for crawl results

Important boundary:

Chat can read/summarize web content, but user-visible saved artifacts must be created through product workspace tools.

### Phase 3: Background Web Jobs

Add bounded, approval-gated jobs for:

- crawl website
- monitor page changes
- batch import docs
- refresh existing web artifacts

Use durable turn APIs or separate workflow/job orchestration depending on duration and retry needs.

### Phase 4: Integrations and Advanced Browser Work

Add MCP connectors and/or product-specific Playwright/Stagehand tools for repeated workflows.

Only consider full `createBrowserTools()` CDP mode after:

- URL/domain policy is solid
- approvals exist for risky actions
- costs are bounded
- inspector visibility is good
- workspace writes remain mediated by `WorkspaceKernel`

## Sources

- Cloudflare Agents Tools: https://developers.cloudflare.com/agents/concepts/tools/
- Cloudflare Think: https://developers.cloudflare.com/agents/api-reference/think/
- Cloudflare Agents Browse the Web: https://developers.cloudflare.com/agents/api-reference/browse-the-web/
- Browser Run Quick Actions: https://developers.cloudflare.com/browser-run/quick-actions/
- Browser Run Quick Actions from Workers changelog: https://developers.cloudflare.com/changelog/post/2026-05-28-use-browser-run-quick-actions-directly-from-workers/
- MCP Client API: https://developers.cloudflare.com/agents/api-reference/mcp-client-api/
- Agents Webhooks: https://developers.cloudflare.com/agents/guides/webhooks/
- Agents Push Notifications: https://developers.cloudflare.com/agents/guides/push-notifications/
