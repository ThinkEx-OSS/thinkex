# Architecture

**Product language:** [`CONTEXT.md`](../CONTEXT.md)  
**Doc index:** [`docs/README.md`](README.md)  
**Behavior:** code — especially `src/features/workspaces/`

## Ownership

| Data | Source of truth |
| --- | --- |
| Auth, users, workspace directory, membership, invites | D1 (`DB`) through Drizzle |
| Workspace items, shell files, events, revisions, presence | `WorkspaceKernel` (Durable Object) |
| Large file bytes | R2 (`WORKSPACE_KERNEL_FILES`) |
| User AI thread directory | `UserAIStore` (Durable Object) |
| AI conversation runtime | `AIThread` (Agent / Durable Object) |
| Collaborative document sessions | `DocumentSession` (Durable Object) |

`WorkspaceKernel` uses `@cloudflare/shell` for the virtual filesystem. UI and AI mutate workspace content through kernel commands, not D1 workspace item tables. D1 owns the directory and access-control records that decide which users can reach a workspace.

## Code map

| Area | Path |
| --- | --- |
| Kernel commands / events | `src/features/workspaces/kernel/` |
| AI threads / tools | `src/features/workspaces/ai/` |
| PDF extraction workflow | `src/features/workspaces/extraction/` |
| Invites | `src/features/workspaces/invites/` |
| Members / permissions | `src/features/workspaces/members/`, `server/permissions.ts` |
| Document sessions | `src/features/workspaces/documents/` |

## Related docs

- **AI web access options:** [`AI_WEB_CAPABILITIES.md`](AI_WEB_CAPABILITIES.md)
- **Email invite ops:** [`README.md`](../README.md#workspace-invite-email-cloudflare-email-service)

## Decisions

Non-obvious choices → `docs/adr/NNNN-slug.md` (create lazily). Do not grow this file back into a monolith.
