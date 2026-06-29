# Skills

Auto-loaded from this directory.

## Repo config

**Issues** — GitHub via `gh`. Heredoc for bodies.

Labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`

**Domain** — `CONTEXT.md` + `docs/adr/` at root. Read if present.

**Git** — `type(scope): subject`, commitlint, scope required. Branch `feat/foo-bar` from `main`. PR: Summary, Test plan, `Closes #N`.

## Workflow

Vertical slices on GitHub, not chat-only plans. Skip steps when scope or user direction makes that sensible.

## Which skill?

| Situation | Skill |
| --- | --- |
| New feature, needs design | `grill-with-docs` → `to-prd` → `to-issues` → `implement` or `tdd` |
| Same session, small scope | `grill-with-docs` → `implement` or `tdd` |
| Incoming GitHub issue | `triage` → `implement` or `tdd` |
| Bug, cause unclear | `diagnosing-bugs` |
| Lock in behavior with tests | `tdd` |

Keep grill → PRD → issues in **one session**. Start a **fresh session per issue** for implement/TDD.

Don't triage issues that `to-issues` already created — they're agent-ready.

## Catalog

| Skill | Use |
| --- | --- |
| `grill-with-docs` | Stress-test a plan + domain docs |
| `grilling` | Interview-only (used by grill-with-docs) |
| `domain-modeling` | Glossary / ADR updates |
| `to-prd` | Conversation → GitHub PRD issue |
| `to-issues` | Plan → vertical-slice issues |
| `implement` | Build from PRD/issues |
| `tdd` | Red-green-refactor slices |
| `triage` | Issue label state machine |
| `diagnosing-bugs` | Systematic debugging |
| `codebase-design` | Deep modules / seams (used by tdd) |
