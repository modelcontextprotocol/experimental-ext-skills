# Findings Template

Use this template when adding experimental findings to `docs/experimental-findings.md`. Copy the section below and fill in each field.

---

## [Project Name]: [Brief Description]

**Date:** YYYY-MM-DD (or approximate timeframe)

**Implementation:**
- **Repo:** [link to repository]
- **Author:** [name/handle]
- **Skill file(s):** [path(s) to SKILL.md or equivalent]

**Approach tested:** [Which approach from `docs/approaches.md` does this map to?]

**Setup:**
- **Clients tested:** [e.g., Claude Desktop, Cline, custom client]
- **Models tested:** [e.g., Claude Sonnet 4, GPT-4o]
- **Configuration notes:** [any relevant setup details]

**What was tested:** [Specific scenarios or behaviors evaluated]

**Results:**
- **What worked:** [observations]
- **What didn't:** [observations]
- **Surprises:** [unexpected findings]

**Requirements addressed:** [Which requirements from `docs/requirements.md` does this provide evidence for?]

**Limitations:** [What remains untested, uncertain, or context-dependent]

---

## How to Contribute Findings

1. Copy the template above
2. Fill in all fields (use "N/A" or "unknown" where something doesn't apply rather than omitting)
3. Add your findings section to `docs/experimental-findings.md` following the existing section order
4. Open a PR with the title `findings: [project name]`
5. Reference any related issues or discussions
