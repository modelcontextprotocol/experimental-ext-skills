---
name: hidden-skill
description: Deliberately omitted from skill://index.json to test baseline direct-read discovery.
---

# Hidden Skill

If you can read this, your client correctly treated a `skill://` URI as
directly readable via `resources/read` even though it never appeared in
`skill://index.json` or was surfaced by any enumeration mechanism.
