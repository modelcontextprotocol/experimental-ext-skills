import {
  ListSkillsRequestSchema,
  ActivateSkillRequestSchema,
  Skill,
  SkillContents
} from "./types.js";

export interface ServerSkill {
  skill: Skill;
  instructions: (params: { name: string }) => string | Promise<string>;
  contents?: (params: { name: string }) => SkillContents | Promise<SkillContents>;
}

/**
 * A helper to register MCP-native Skills handlers on a standard Server.
 */
export function setupSkills(server: any, skills: ServerSkill[]) {
  server.setRequestHandler(ListSkillsRequestSchema, async (request: any) => {
    return {
      skills: skills.map(s => s.skill),
    };
  });

  server.setRequestHandler(ActivateSkillRequestSchema, async (request: any) => {
    const name = request.params.name;
    const s = skills.find((sk) => sk.skill.name === name);

    if (!s) {
      throw new Error(`Skill not found: ${name}`);
    }

    const instructions = await s.instructions({ name });
    const contents = s.contents ? await s.contents({ name }) : undefined;

    return {
      instructions,
      contents,
    };
  });
}
