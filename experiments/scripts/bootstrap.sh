#!/usr/bin/env bash
# Populate experiments/.workspace/ with the canonical clones the
# run-scenario skill and harnesses depend on.
#
# Idempotent: re-run to fast-forward each clone. Skips clones with
# a dirty working tree to preserve in-progress edits.
#
# Codex and goose are NOT cloned here — the harnesses pick them up
# via `cargo install --git`. Run those installs manually; see
# .claude/skills/run-scenario/SKILL.md for the exact commands.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
WORKSPACE_DIR="$REPO_ROOT/experiments/.workspace"

for arg in "$@"; do
  case "$arg" in
    --help|-h)
      cat <<USAGE
Usage: $(basename "$0")

Clones (or fast-forwards) into $WORKSPACE_DIR:
  - olaservo/code-review-subject       subject repo + scaffold script
  - olaservo/github-mcp-server         add-agent-skills branch; builds binary
USAGE
      exit 0
      ;;
    *)
      echo "Unknown arg: $arg" >&2
      exit 2
      ;;
  esac
done

mkdir -p "$WORKSPACE_DIR"

clone_or_pull() {
  local url="$1" branch="$2" dest="$3"
  if [[ -d "$dest/.git" ]]; then
    if ! git -C "$dest" diff-index --quiet HEAD --; then
      echo "==> $dest has local changes; skipping fast-forward."
      return 0
    fi
    echo "==> Updating $dest ($branch)..."
    git -C "$dest" fetch origin "$branch"
    git -C "$dest" checkout "$branch"
    git -C "$dest" merge --ff-only "origin/$branch"
  else
    echo "==> Cloning $url -> $dest..."
    git clone --branch "$branch" "$url" "$dest"
  fi
}

clone_or_pull \
  https://github.com/olaservo/code-review-subject.git \
  main \
  "$WORKSPACE_DIR/code-review-subject"

clone_or_pull \
  https://github.com/olaservo/github-mcp-server.git \
  add-agent-skills \
  "$WORKSPACE_DIR/github-mcp-server"

if command -v go >/dev/null 2>&1; then
  echo "==> Building github-mcp-server binary..."
  (
    cd "$WORKSPACE_DIR/github-mcp-server"
    go build -o github-mcp-server.exe ./cmd/github-mcp-server
  )
else
  echo "==> WARNING: go not on PATH; install Go to build the server binary." >&2
fi

cat <<DONE

Done. The harnesses default to these locations, so no env vars are
needed if Claude Code's CWD is inside this repo. To run from outside,
or to point at sibling clones instead, export:

  export SUBJECT_REPO_DIR=$WORKSPACE_DIR/code-review-subject
  export MCP_SERVER_DIR=$WORKSPACE_DIR/github-mcp-server

Codex and goose: cargo install --git per SKILL.md.
DONE
