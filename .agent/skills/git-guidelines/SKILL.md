---
name: git-guidelines
description: Follow Git branch and commit naming conventions. Use when creating branches, making commits, or when asked about Git conventions.
metadata:
  version: "1.0.0"
---

# Git Guidelines

Follow these conventions when naming branches and writing commit messages.

## Branch Naming Convention

### Category

A Git branch should start with a **category**. Pick one of these:

* `feature` — adding, refactoring, or removing a feature
* `bugfix` — fixing a bug
* `hotfix` — changing code with a temporary solution and/or without following the usual process (usually because of an emergency)
* `test` — experimenting outside of an issue/ticket

### Reference

After the category, add a `/` followed by the reference of the issue/ticket you are working on.

If there's no reference, use `no-ref`.

### Description

After the reference, add another `/` followed by a short description that summarizes the purpose of the branch.

Guidelines:

* Use **kebab-case**
* Keep it short
* You can reuse the issue/ticket title
* Replace special characters with `-`

### Pattern

```bash
git branch <category/reference/description-in-kebab-case>
```

### Examples

```bash
# Add, refactor, or remove a feature
git branch feature/issue-42/create-new-button-component

# Fix a bug
git branch bugfix/issue-342/button-overlap-form-on-mobile

# Emergency fix (possibly temporary)
git branch hotfix/no-ref/registration-form-not-working

# Experiment outside of an issue/ticket
git branch test/no-ref/refactor-components-with-atomic-design
```

---

## Commit Naming Convention

For commits, combine and simplify the **Angular Commit Message Guideline** and the **Conventional Commits** guideline.

### Category

A commit message should start with a **category of change**. These four are usually enough:

* `feat` — adding a new feature
* `fix` — fixing a bug
* `refactor` — changing code for performance or convenience (e.g. readability)
* `chore` — everything else (documentation, formatting, tests, cleanup, etc.)

After the category, add a `:` to announce the commit description.

### Statement(s)

After the colon:

* Write short statements describing the changes
* Start each statement with an **imperative verb**
* Separate multiple statements with a `;`

### Pattern

```bash
git commit -m '<category: do something; do some other things>'
```

### Examples

```bash
git commit -m 'feat: add new button component; add new button components to templates'
git commit -m 'fix: add stop directive to button component to prevent propagation'
git commit -m 'refactor: rewrite button component in TypeScript'
git commit -m 'chore: write button documentation'
```

## Credits

Based on: https://dev.to/varbsan/a-simplified-convention-for-naming-branches-and-commits-in-git-il4
