import { IsBoolean, IsNumber, IsOptional } from "class-validator";
import { Environment } from "@server/env";

class MCPPluginEnvironment extends Environment {
  /**
   * Enable the MCP server plugin. Defaults to true.
   */
  @IsOptional()
  @IsBoolean()
  public MCP_ENABLED = this.toBoolean(process.env.MCP_ENABLED ?? "true");

  /**
   * Comma-separated list of allowed Origins for MCP requests.
   * Defaults to the Outline URL origin when available.
   */
  @IsOptional()
  public MCP_ALLOWED_ORIGINS = this.toOptionalString(
    process.env.MCP_ALLOWED_ORIGINS ?? process.env.URL
  );

  /**
   * Session TTL in minutes for MCP Streamable HTTP sessions.
   */
  @IsOptional()
  @IsNumber()
  public MCP_SESSION_TTL_MINUTES = (() => {
    const parsed = this.toOptionalNumber(process.env.MCP_SESSION_TTL_MINUTES);
    if (parsed === undefined || Number.isNaN(parsed)) {
      return 60;
    }
    return parsed;
  })();
}

export default new MCPPluginEnvironment();
