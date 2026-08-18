import {
  ListSkillsResultSchema,
  ListSkillsResult,
  ActivateSkillResultSchema,
  ActivateSkillResult
} from "./types.js";

export class SkillsClient {
  constructor(private client: any) {}

  async listSkills(cursor?: string) {
    return this.client.request(
      {
        method: "skills/list",
        params: cursor ? { cursor } : undefined
      } as any,
      ListSkillsResultSchema as any
    ) as Promise<ListSkillsResult>;
  }

  async activateSkill(name: string) {
    return this.client.request(
      {
        method: "skills/activate",
        params: { name }
      } as any,
      ActivateSkillResultSchema as any
    ) as Promise<ActivateSkillResult>;
  }
}
