---
name: code-review
description: Perform structured code reviews focusing on correctness, readability, and maintainability. Use when asked to review code changes or pull requests.
metadata:
  author: skills-over-mcp-ig
  version: "0.1"
---

# Code Review

Perform structured code reviews using a consistent methodology.

## When to Use

- User asks you to review code, a diff, or a pull request
- User asks for feedback on code quality
- You are evaluating code changes before merge

## Process

1. **Understand the context** — read the PR description or ask what the change is trying to accomplish
2. **Review for correctness** — does the code do what it claims? Are there logic errors, off-by-one bugs, or unhandled edge cases?
3. **Review for security** — check for injection vulnerabilities, improper input validation, hardcoded secrets, and OWASP top 10 issues
4. **Review for readability** — are names clear? Is the structure easy to follow? Is there unnecessary complexity?
5. **Review for maintainability** — is the code testable? Are dependencies reasonable? Will this be easy to change later?
6. **Check the tests** — are there tests? Do they cover the important cases? Are they testing behavior, not implementation?

## Severity Levels

- **Blocker**: Must fix before merge (security issues, data loss risk, broken functionality)
- **Major**: Should fix before merge (logic errors, missing edge cases, poor error handling)
- **Minor**: Nice to fix (naming, style, minor simplifications)
- **Nit**: Optional (personal preference, cosmetic)

## Reference

For a detailed checklist, see `references/REFERENCE.md` in this skill's directory.

## Output Format

For each finding:
- **File and line**: Where the issue is
- **Severity**: Blocker / Major / Minor / Nit
- **Issue**: What's wrong
- **Suggestion**: How to fix it

End with an overall summary: approve, request changes, or comment.
