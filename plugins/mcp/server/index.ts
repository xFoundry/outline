import { PluginManager, Hook } from "@server/utils/PluginManager";
import config from "../plugin.json";
import mcpRouter from "./api/mcp";
import env from "./env";

if (env.MCP_ENABLED) {
  PluginManager.add({
    ...config,
    type: Hook.API,
    value: mcpRouter,
  });
}
