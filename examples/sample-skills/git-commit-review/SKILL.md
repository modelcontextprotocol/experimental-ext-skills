---
name: git-commit-review
description: Review git commits for quality, conventional commit format compliance, and potential issues. Use when asked to review commits or improve commit messages.
metadata:
  author: skills-over-mcp-ig
  version: "0.1"
---

# Git Commit Review

Review git commits against conventional commit standards and common quality issues.

## When to Use

- User asks you to review a commit or commit message
- User asks for help improving commit quality
- You are reviewing a PR and want to assess commit hygiene

## Process

1. **Read the commit message** — check for conventional commit format: `type(scope): description`
2. **Verify the type** — must be one of: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `ci`, `build`, `perf`
3. **Check the description** — should be imperative mood, lowercase, no period at end, under 72 characters
4. **Review the body** (if present) — should explain *why* not *what*, wrapped at 72 characters
5. **Check for breaking changes** — must include `BREAKING CHANGE:` footer or `!` after type/scope
6. **Assess the diff** — does the commit message accurately describe the changes?

## Common Issues

- Vague messages ("fix stuff", "update code", "wip")
- Type mismatch (using `feat` for a bug fix)
- Scope too broad (single commit touching unrelated files)
- Missing breaking change annotation
- Commit contains unrelated changes that should be separate commits

## Output Format

Provide a structured review:
- **Format**: Pass/Fail with specific issues
- **Message quality**: Rating and suggestions
- **Scope assessment**: Whether changes match the stated scope
- **Recommendations**: Concrete improvements
