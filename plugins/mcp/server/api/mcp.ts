import Router from "koa-router";
import { z } from "zod";
import { randomUUID } from "crypto";
import auth from "@server/middlewares/authentication";
import { APIContext, AuthenticationType } from "@server/types";
import Logger from "@server/logging/Logger";
import { allTools, ToolName } from "../tools";
import env from "../env";

const router = new Router();

/**
 * CORS middleware for MCP endpoints
 * Allows cross-origin requests from any origin (or configure specific origins)
 */
router.all("mcp*", async (ctx, next) => {
  // Allow requests from any origin for MCP (or set specific allowed origins)
  const allowedOrigin = ctx.get("Origin") || "*";

  ctx.set("Access-Control-Allow-Origin", allowedOrigin);
  ctx.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  ctx.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With"
  );
  ctx.set("Access-Control-Allow-Credentials", "true");
  ctx.set("Access-Control-Max-Age", "86400");

  // Handle preflight requests
  if (ctx.method === "OPTIONS") {
    ctx.status = 204;
    return;
  }

  await next();
});

// JSON-RPC 2.0 types
interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

// MCP Protocol version
const MCP_PROTOCOL_VERSION = "2024-11-05";

// Server info
const SERVER_INFO = {
  name: "outline-mcp",
  version: "1.0.0",
};

/**
 * Build tool definitions for MCP protocol
 */
function buildToolDefinitions() {
  return Object.entries(allTools).map(([name, tool]) => ({
    name,
    description: tool.description,
    inputSchema: {
      type: "object" as const,
      properties: Object.fromEntries(
        Object.entries(tool.inputSchema.shape).map(([key, schema]) => {
          const zodSchema = schema as z.ZodTypeAny;
          return [
            key,
            {
              type: getJsonSchemaType(zodSchema),
              description: zodSchema.description,
            },
          ];
        })
      ),
      required: Object.entries(tool.inputSchema.shape)
        .filter(([_, schema]) => !(schema as z.ZodTypeAny).isOptional())
        .map(([key]) => key),
    },
  }));
}

/**
 * Convert Zod type to JSON Schema type
 */
function getJsonSchemaType(schema: z.ZodTypeAny): string {
  const typeName = schema._def.typeName;

  if (typeName === "ZodOptional" || typeName === "ZodDefault") {
    return getJsonSchemaType(schema._def.innerType);
  }

  switch (typeName) {
    case "ZodString":
      return "string";
    case "ZodNumber":
      return "number";
    case "ZodBoolean":
      return "boolean";
    case "ZodArray":
      return "array";
    case "ZodObject":
      return "object";
    case "ZodEnum":
      return "string";
    default:
      return "string";
  }
}

/**
 * Handle MCP JSON-RPC requests
 */
async function handleMcpRequest(
  request: JsonRpcRequest,
  ctx: APIContext
): Promise<JsonRpcResponse> {
  const { user } = ctx.state.auth;

  try {
    switch (request.method) {
      case "initialize": {
        return {
          jsonrpc: "2.0",
          id: request.id,
          result: {
            protocolVersion: MCP_PROTOCOL_VERSION,
            capabilities: {
              tools: {},
            },
            serverInfo: SERVER_INFO,
          },
        };
      }

      case "tools/list": {
        return {
          jsonrpc: "2.0",
          id: request.id,
          result: {
            tools: buildToolDefinitions(),
          },
        };
      }

      case "tools/call": {
        const params = request.params as {
          name: string;
          arguments?: Record<string, unknown>;
        };

        if (!params?.name) {
          return {
            jsonrpc: "2.0",
            id: request.id,
            error: {
              code: -32602,
              message: "Invalid params: missing tool name",
            },
          };
        }

        const toolName = params.name as ToolName;
        const tool = allTools[toolName];

        if (!tool) {
          return {
            jsonrpc: "2.0",
            id: request.id,
            error: {
              code: -32601,
              message: `Unknown tool: ${params.name}`,
            },
          };
        }

        // Validate and parse input
        const parseResult = tool.inputSchema.safeParse(params.arguments ?? {});
        if (!parseResult.success) {
          return {
            jsonrpc: "2.0",
            id: request.id,
            error: {
              code: -32602,
              message: `Invalid tool arguments: ${parseResult.error.message}`,
            },
          };
        }

        Logger.debug("mcp", `Executing tool ${toolName}`, {
          userId: user.id,
          teamId: user.teamId,
        });

        // Execute the tool - data is validated by Zod schema above
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic tool dispatch requires any
        const result = await tool.handler(
          parseResult.data as Parameters<typeof tool.handler>[0],
          user
        );

        return {
          jsonrpc: "2.0",
          id: request.id,
          result,
        };
      }

      case "ping": {
        return {
          jsonrpc: "2.0",
          id: request.id,
          result: {},
        };
      }

      case "notifications/initialized": {
        // Client notification that initialization is complete
        return {
          jsonrpc: "2.0",
          id: request.id,
          result: {},
        };
      }

      default: {
        return {
          jsonrpc: "2.0",
          id: request.id,
          error: {
            code: -32601,
            message: `Method not found: ${request.method}`,
          },
        };
      }
    }
  } catch (error) {
    Logger.error("MCP request error", error as Error, {
      method: request.method,
      userId: user?.id,
    });

    return {
      jsonrpc: "2.0",
      id: request.id,
      error: {
        code: -32603,
        message: error instanceof Error ? error.message : "Internal error",
      },
    };
  }
}

/**
 * MCP endpoint - handles JSON-RPC 2.0 requests
 * Supports both single requests and batch requests
 */
router.post(
  "mcp",
  auth({
    type: [AuthenticationType.API, AuthenticationType.OAUTH],
  }),
  async (ctx: APIContext) => {
    if (!env.MCP_ENABLED) {
      ctx.status = 404;
      ctx.body = { error: "MCP server is disabled" };
      return;
    }

    const body = ctx.request.body;

    // Handle batch requests
    if (Array.isArray(body)) {
      const responses = await Promise.all(
        body.map((req: JsonRpcRequest) => handleMcpRequest(req, ctx))
      );
      ctx.body = responses;
      return;
    }

    // Handle single request
    const request = body as JsonRpcRequest;

    if (request.jsonrpc !== "2.0") {
      ctx.body = {
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32600,
          message: "Invalid Request: must be JSON-RPC 2.0",
        },
      };
      return;
    }

    const response = await handleMcpRequest(request, ctx);
    ctx.body = response;
  }
);

/**
 * MCP Server-Sent Events endpoint for streaming
 * Used for long-running operations and real-time updates
 */
router.get(
  "mcp/sse",
  auth({
    type: [AuthenticationType.API, AuthenticationType.OAUTH],
  }),
  async (ctx: APIContext) => {
    if (!env.MCP_ENABLED) {
      ctx.status = 404;
      ctx.body = { error: "MCP server is disabled" };
      return;
    }

    const { user } = ctx.state.auth;

    // Set up SSE headers
    ctx.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    ctx.status = 200;

    // Send initial connection event
    const sessionId = randomUUID();
    ctx.res.write(
      `event: endpoint\ndata: ${JSON.stringify({ endpoint: `/api/mcp?sessionId=${sessionId}` })}\n\n`
    );

    Logger.debug("mcp", "SSE connection established", {
      userId: user.id,
      sessionId,
    });

    // Keep connection alive with periodic pings
    const pingInterval = setInterval(() => {
      try {
        ctx.res.write(`: ping\n\n`);
      } catch {
        clearInterval(pingInterval);
      }
    }, 30000);

    // Clean up on close
    ctx.req.on("close", () => {
      clearInterval(pingInterval);
      Logger.debug("mcp", "SSE connection closed", {
        userId: user.id,
        sessionId,
      });
    });

    // Keep the connection open
    await new Promise((resolve) => {
      ctx.req.on("close", resolve);
    });
  }
);

/**
 * MCP info endpoint - returns server capabilities
 * Useful for clients to discover the MCP server
 */
router.get(
  "mcp/info",
  auth({
    optional: true,
    type: [AuthenticationType.API, AuthenticationType.OAUTH],
  }),
  async (ctx: APIContext) => {
    if (!env.MCP_ENABLED) {
      ctx.status = 404;
      ctx.body = { error: "MCP server is disabled" };
      return;
    }

    ctx.body = {
      name: SERVER_INFO.name,
      version: SERVER_INFO.version,
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {
        tools: buildToolDefinitions().map((t) => t.name),
      },
      authentication: {
        required: true,
        methods: ["bearer", "api_key", "oauth"],
        oauthEndpoints: {
          authorize: "/oauth/authorize",
          token: "/oauth/token",
          revoke: "/oauth/revoke",
        },
      },
    };
  }
);

export default router;
