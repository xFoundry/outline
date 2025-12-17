import { documentTools } from "./documents";
import { collectionTools } from "./collections";
import { userTools } from "./users";

/**
 * All MCP tools available in the Outline MCP server
 */
export const allTools = {
  ...documentTools,
  ...collectionTools,
  ...userTools,
};

export type ToolName = keyof typeof allTools;

export { documentTools, collectionTools, userTools };
