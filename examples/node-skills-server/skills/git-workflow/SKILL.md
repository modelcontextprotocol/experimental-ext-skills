---
name: git-workflow
description: Follow this team's Git conventions for branching and commits
---

# Git Workflow

Use this workflow when creating branches or committing changes on behalf of the user.

## Branching

- Branch names: `<type>/<short-description>`, where `<type>` is one of `feat`, `fix`, `chore`, `docs`.
- Branch off the default branch unless the user names a different base.

## Commits

- Write commit subjects in the imperative mood ("Add X", not "Added X").
- Keep the subject line under 72 characters; wrap the body at 100.
- Reference an issue number in the body when one exists (`Refs #123`), not the subject.

## Before opening a PR

- Confirm the branch builds and tests pass.
- Squash fixup commits into their parent before pushing.
