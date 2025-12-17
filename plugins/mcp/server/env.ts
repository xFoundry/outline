import { IsBoolean, IsOptional } from "class-validator";
import { Environment } from "@server/env";

class MCPPluginEnvironment extends Environment {
  /**
   * Enable the MCP server plugin. Defaults to true.
   */
  @IsOptional()
  @IsBoolean()
  public MCP_ENABLED = this.toBoolean(process.env.MCP_ENABLED ?? "true");
}

export default new MCPPluginEnvironment();
