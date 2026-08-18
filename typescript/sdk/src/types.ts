import { z } from "zod";
import type {
  PaginatedRequest,
  PaginatedResult,
  Request,
  Result,
  Tool,
  Prompt,
  Resource,
} from "@modelcontextprotocol/sdk/types.js";

export const SkillSchema = z.object({
  name: z.string().min(1).max(64).regex(/^[a-z0-9-]+$/),
  title: z.string().optional(),
  description: z.string(),
  _meta: z.record(z.unknown()).optional()
});

export type Skill = {
  name: string;
  title?: string;
  description: string;
  _meta?: Record<string, unknown>;
};

export const ListSkillsRequestSchema: any = z.object({
  method: z.literal("skills/list")
}).passthrough();

export interface ListSkillsRequest extends PaginatedRequest {
  method: "skills/list";
}

export const ListSkillsResultSchema: any = z.object({
  skills: z.array(SkillSchema)
}).passthrough();

export interface ListSkillsResult extends PaginatedResult {
  skills: Skill[];
}

export const ActivateSkillRequestSchema: any = z.object({
  method: z.literal("skills/activate"),
  params: z.object({ name: z.string() }).passthrough()
}).passthrough();

export interface ActivateSkillRequest extends Request {
  method: "skills/activate";
  params: {
    name: string;
    [key: string]: unknown;
  };
}

export const ActivateSkillResultSchema: any = z.object({
  instructions: z.string()
}).passthrough();

export interface SkillContents {
  tools?: Tool[];
  prompts?: Prompt[];
  resources?: Resource[];
  skills?: Skill[];
}

export interface ActivateSkillResult extends Result {
  instructions: string;
  contents?: SkillContents;
}
