/**
 * Protocol surface of the Skills Extension (SEP-2640 v1): the `skills/list`
 * and `skills/get` methods.
 *
 * Every server declaring the `io.modelcontextprotocol/skills` extension MUST
 * implement both methods:
 *
 *   skills/list — enumerates the skills a server serves. Paginated via the
 *   standard `cursor`/`nextCursor` contract; an entry is atomic (a skill's
 *   `resources` set is never split across pages). The result MAY be empty or
 *   partial — hosts MUST NOT treat that as proof a server has no skills. In
 *   protocol versions 2026-07-28+ the result also carries the SEP-2549
 *   list-caching attributes (`ttlMs`, `cacheScope`).
 *
 *   skills/get — returns the entry for a single skill named by the URI of
 *   its `SKILL.md`. The `skill` object is identical in shape and meaning to
 *   a `skills/list` entry. A server MUST answer for every skill it serves,
 *   whether or not it appears in the listing, and MUST return error `-32602`
 *   (Invalid params) for URIs it does not serve as skills.
 *
 * The zod schemas here are Standard Schemas: pass the params/result pair to
 * the v2 MCP SDK's `setRequestHandler(method, { params, result }, handler)`
 * on the server, and the result schema to `client.request(request, schema)`
 * on the client.
 */

import { z } from "zod";

/** JSON-RPC method name for skill enumeration (SEP-2640). */
export const SKILLS_LIST_METHOD = "skills/list";

/** JSON-RPC method name for single-skill entry retrieval (SEP-2640). */
export const SKILLS_GET_METHOD = "skills/get";

/**
 * Marker value of `resources` for a dynamically generated skill: the server
 * cannot publish stable digests, so it says so explicitly rather than
 * omitting the field (SEP-2640 "Resources").
 */
export const DYNAMIC_RESOURCES = "dynamic";

/** Maximum entries in a skill's `resources`, `SKILL.md` included (SEP-2640 "Limits"). */
export const MAX_RESOURCES_PER_SKILL = 512;

/** Maximum sum of `size` over a skill's `resources`: 16 MiB (SEP-2640 "Limits"). */
export const MAX_TOTAL_SIZE_PER_SKILL = 16_777_216;

/**
 * One file of a skill within an entry's `resources` manifest.
 * `digest` is `sha256:{hex}` over the file's raw bytes; `size` is the byte
 * length of those same bytes.
 */
export const SkillResourceRefSchema = z.looseObject({
  uri: z.string(),
  digest: z.string(),
  size: z.number().int().min(0),
});

/**
 * A skill entry — shared by `skills/list` (array element) and `skills/get`
 * (the `skill` object). `frontmatter` is the verbatim SKILL.md frontmatter
 * as JSON; `resources` is required and is either a complete file manifest
 * or the string `"dynamic"`. An entry with no `resources` is invalid.
 */
export const SkillEntrySchema = z.looseObject({
  uri: z.string(),
  frontmatter: z.record(z.string(), z.unknown()),
  resources: z.union([
    z.array(SkillResourceRefSchema),
    z.literal(DYNAMIC_RESOURCES),
  ]),
});

/** Params schema for `skills/list` — an optional pagination cursor. */
export const SkillsListParamsSchema = z.looseObject({
  cursor: z.string().optional(),
});

/**
 * Result schema for `skills/list`. `ttlMs`/`cacheScope` are the SEP-2549
 * list-caching attributes carried in protocol versions 2026-07-28+.
 */
export const SkillsListResultSchema = z.looseObject({
  skills: z.array(SkillEntrySchema),
  nextCursor: z.string().optional(),
  ttlMs: z.number().int().min(0).optional(),
  cacheScope: z.enum(["public", "private"]).optional(),
});

/** Params schema for `skills/get` — the URI of a skill's `SKILL.md`. */
export const SkillsGetParamsSchema = z.looseObject({
  uri: z.string(),
});

/**
 * Result schema for `skills/get`: a single entry, no pagination cursor and
 * no list-caching attributes (a single entry is not a list; it is a
 * point-in-time snapshot of the skill as the server holds it).
 */
export const SkillsGetResultSchema = z.looseObject({
  skill: SkillEntrySchema,
});
