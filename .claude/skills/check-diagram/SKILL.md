---
name: check-diagram
description: Check that a skills-over-MCP surfaces diagram (SVG) matches the latest commit of the implementation branch it describes. Works for any client or server implementation. Use when asked whether a diagram is accurate, current, or needs updating after a branch moved.
---

# Check a diagram against the branch tip

Input: a path to an SVG in this repo (`experiments/**/*.svg`). Optional: `owner/repo@branch` if the diagram does not name one.

## 1. Identify the implementation

Nothing about the implementation is fixed in this skill. Find it from the material itself:

- the SVG text usually names the branch (grep it for `feature/`, `-port`, `branch`);
- the README that links the diagram (`grep -rl <svg-filename> --include=*.md`) names the repo as a GitHub URL and the branch;
- if the diagram has no README link yet, the nearest README above it in `experiments/` names the reference server and host.

If neither the diagram nor a README names a repo and branch, ask; do not guess from local clones.

## 2. Get the branch tip, not a local checkout

Local clones and worktrees go stale. Always resolve the remote tip first:

```
git ls-remote https://github.com/<owner>/<repo> refs/heads/<branch>
```

Then read code at that exact commit. Either fetch into an existing clone (`git fetch origin <branch>` then `git show origin/<branch>:<path>` and `git grep <pattern> origin/<branch> -- <paths>`), or shallow-clone into the scratchpad (`git clone --depth 1 --branch <branch> <url>`). Never read from a working tree without confirming `git rev-parse HEAD` equals the `ls-remote` sha.

Record the sha and its date in the report.

## 3. Extract the diagram's claims

Pull the text out of the SVG:

```
grep -o '<text[^>]*>[^<]*' <svg> | sed 's/<text[^>]*>//'
```

Turn every concrete statement into a checkable claim. Typical claim types:

- protocol methods and capability declarations (`skills/list`, `capabilities.extensions["io.modelcontextprotocol/skills"] = { directoryRead: true }`)
- wire shapes and field names (`{uri, digest, size}`, `"dynamic"`, `resultType`)
- URI patterns (`skill://github/<name>/…`, `skill://{owner}/{repo}/{skill}/{file}`)
- tool names and what they route to (`load_skill`, `read_resource`, `list_repo_skills`)
- gates and behaviours (digest + size check, frontmatter identity, unlisted file refused, one `skills/get` retry, per-server `skills_enabled`)
- counts (`28 regular Agent Skills`) and the branch name itself

Layout, colour, and wording that carries no fact are not claims.

## 4. Verify each claim in the code at the tip

For each claim find the code that implements it and cite `path:line` at the checked sha. Search, do not recall: method names in request handlers or dispatch, field names in the wire structs, URI prefixes as string constants, counts by listing the directory. A claim is one of:

- **matches** — code at the tip does what the diagram says; cite the evidence
- **stale** — the tip does something different; say what, cite the evidence
- **missing** — the tip has a surface the diagram does not show and a reader would expect on it
- **unverifiable** — could not find evidence either way; say what was searched

Then compare against the SEP baseline the branch claims to track (`docs/sep-draft-skills-extension.md` header pins the commit; the PR is authoritative per AGENTS.md). Flag any diagram claim that matches the code but no longer matches the spec, since the code will change next.

## 5. Report

Plain markdown, one table row per claim, then the branch sha/date and the SEP commit compared. Below the table, list the exact SVG text edits needed for each stale or missing item. Do not edit the SVG unless asked; the diagrams are hand-authored and the user updates them.
