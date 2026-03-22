# Skills Extension SEP — Architecture

## How It All Fits Together

```
┌─────────────────────────────────────────────────────────────────────┐
│                              HOST                                   │
│                                                                     │
│  ┌───────────────┐    Exposes to model:                             │
│  │  read_resource │◄── { server, uri }                              │
│  │     (tool)     │    "Read an MCP resource from a connected       │
│  └───────┬───────┘     server."                                     │
│          │                                                          │
│          │  Routes by server name                                   │
│          ▼                                                          │
│  ┌───────────────┐         ┌───────────────┐                        │
│  │  MCP Client A  │         │  MCP Client B  │   ...                │
│  └───────┬───────┘         └───────────────┘                        │
└──────────┼──────────────────────────────────────────────────────────┘
           │ stdio / SSE
           ▼
┌──────────────────────────────────────────────────────────────────────┐
│                         MCP SERVER                                   │
│                                                                      │
│  capabilities.extensions: { "io.modelcontextprotocol/skills": {} }   │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐   │
│  │                    Skills Extension SDK                        │   │
│  │                                                                │   │
│  │  discoverSkills(skillsDir)                                     │   │
│  │    ├── Recursively finds SKILL.md files                        │   │
│  │    ├── Parses YAML frontmatter (name, description)             │   │
│  │    ├── Validates: final path segment == frontmatter name       │   │
│  │    ├── Enforces no-nesting constraint                          │   │
│  │    └── Returns Map<skillPath, SkillMetadata>                   │   │
│  │                                                                │   │
│  │  registerSkillResources(server, skillMap, skillsDir)           │   │
│  │    ├── skill://{path}/SKILL.md     (listed, per skill)         │   │
│  │    ├── skill://{path}/_manifest    (listed, per skill)         │   │
│  │    ├── skill://{+filePath}         (template, supporting)      │   │
│  │    └── skill://prompt-xml          (optional, XML summary)     │   │
│  │                                                                │   │
│  │  SEP-2093 shims (resource-extensions.ts)                       │   │
│  │    ├── resources/metadata          (metadata without content)  │   │
│  │    ├── resources/list + uri param  (scoped enumeration)        │   │
│  │    └── _meta capabilities          (per-resource capabilities) │   │
│  └────────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐   │
│  │                      Skills Directory                          │   │
│  │                                                                │   │
│  │  sample-skills/                                                │   │
│  │  ├── code-review/                                              │   │
│  │  │   ├── SKILL.md          ──► skill://code-review/SKILL.md    │   │
│  │  │   └── references/                                           │   │
│  │  │       └── REFERENCE.md  ──► skill://code-review/ref...md    │   │
│  │  ├── git-commit-review/                                        │   │
│  │  │   └── SKILL.md          ──► skill://git-commit-review/...   │   │
│  │  └── acme/                      ◄── organizational prefix      │   │
│  │      ├── billing/                                              │   │
│  │      │   └── refunds/           ◄── name = "refunds"           │   │
│  │      │       ├── SKILL.md  ──► skill://acme/billing/refunds/.. │   │
│  │      │       └── templates/                                    │   │
│  │      │           └── email ──► skill://acme/billing/refunds/.. │   │
│  │      └── onboarding/            ◄── name = "onboarding"        │   │
│  │          └── SKILL.md      ──► skill://acme/onboarding/...     │   │
│  └────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────┘
```

## Skill URI Structure

```
skill://<skill-path>/SKILL.md
        ├──────────┘ └──────┘
        │                │
        │                └── file-path (always explicit)
        │
        └── locator: prefix + name
            ├── prefix: server-chosen (e.g., "acme/billing")
            └── name:   final segment = frontmatter name (e.g., "refunds")
```

## Discovery Flow

```
Host                           Server
 │                               │
 │  initialize ──────────────►   │
 │  ◄──── capabilities:          │
 │        extensions:             │
 │          io.modelcontextprotocol/skills: {}
 │                               │
 │  resources/list ──────────►   │  Returns all resources
 │  ◄──── skill://*/SKILL.md     │  (client filters for skill://)
 │        entries                 │
 │                               │
 │  resources/list ──────────►   │  SEP-2093: scoped
 │    { uri: "skill://" }        │  Returns only SKILL.md entries
 │  ◄──── filtered list          │
 │                               │
 │  resources/metadata ──────►   │  SEP-2093: metadata only
 │    { uri: "skill://..." }     │  No content transferred
 │  ◄──── { resource: { name,   │
 │         description, caps } } │
 │                               │
 │  resources/read ──────────►   │  Load skill content
 │    { uri: "skill://..." }     │
 │  ◄──── { contents: [{ text:  │
 │         "---\nname: ...\n..." │
 │         }] }                  │
 │                               │
```

## SDK Wrapper Mapping

```
SEP Concept                  SDK Function               Protocol Call
─────────────────────────────────────────────────────────────────────
Host tool for model          READ_RESOURCE_TOOL          (tool schema)
Discover skills              listSkills()                resources/list
Scoped discovery             listSkillsScoped(uri)       resources/list + uri
Read any skill URI           readSkillUri(uri)           resources/read
Read by path                 readSkillContent(path)      resources/read
Metadata without content     fetchSkillMetadata(uri)     resources/metadata
File manifest                readSkillManifest(path)     resources/read
Supporting files             readSkillDocument(path,f)   resources/read
```

## What's a Shim vs What's the SEP

```
┌──────────────────────────────┬────────────────────────────────────┐
│        SEP (permanent)       │     SDK Shims (temporary)          │
├──────────────────────────────┼────────────────────────────────────┤
│ skill:// URI convention      │ ServerInternals interface          │
│ SKILL.md explicit in URI     │ _requestHandlers override          │
│ Final segment = name         │ _capabilities patching             │
│ No-nesting constraint        │ capabilities in _meta              │
│ resources/read for loading   │                                    │
│ resources/list for discovery │ Tracking PRs:                      │
│ resources/metadata (2093)    │  - typescript-sdk#1630 (extensions)│
│ read_resource host tool      │  - SEP-2093 (uri param, metadata,  │
│ Extension declaration        │    per-resource capabilities)      │
│ listSkills / readSkillUri    │                                    │
└──────────────────────────────┴────────────────────────────────────┘
```
