import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SkillsClient } from "@modelcontextprotocol/mcp-native-skills";
import * as path from "path";
import * as url from "url";

const __dirname = url.fileURLToPath(new URL(".", import.meta.url));
const serverPath = path.resolve(__dirname, "../../../skills-server/typescript/dist/index.js");

async function main() {
  const transport = new StdioClientTransport({
    command: "node",
    args: [serverPath],
  });

  const client = new Client(
    { name: "example-skills-client", version: "1.0.0" },
    { capabilities: {} }
  );

  await client.connect(transport);

  const skillsClient = new SkillsClient(client);

  console.log("Fetching skills list...");
  const listResponse = await skillsClient.listSkills();
  console.log(JSON.stringify(listResponse, null, 2));

  if (listResponse.skills.length > 0) {
    // Activating the weather skill
    console.log(`\n================================================`);
    console.log(`Activating skill: weather-forecaster`);
    const weatherResponse = await skillsClient.activateSkill("weather-forecaster");
    console.log(JSON.stringify(weatherResponse, null, 2));

    const weatherTools = weatherResponse.contents?.tools || [];
    const weatherTool = weatherTools.find(t => t.name === "get_weather");
    if (weatherTool) {
      console.log(`\nExecuting discovered tool: ${weatherTool.name}`);
      const toolResult = await client.callTool({
        name: weatherTool.name,
        arguments: { city: "Cambridge" }
      });
      console.log(JSON.stringify(toolResult, null, 2));
    }

    // Activating the knowledge-base skill
    console.log(`\n================================================`);
    console.log(`Activating skill: knowledge-base`);
    const kbResponse = await skillsClient.activateSkill("knowledge-base");
    console.log(JSON.stringify(kbResponse, null, 2));

    const resources = kbResponse.contents?.resources || [];
    const docResource = resources.find(r => r.uri.includes("project-guidelines"));
    if (docResource) {
      console.log(`\nGetting discovered resource: ${docResource.uri}`);
      const runResult = await client.readResource({ uri: docResource.uri });
      console.log(JSON.stringify(runResult, null, 2));
    }
  } else {
    console.log("No skills found.");
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
