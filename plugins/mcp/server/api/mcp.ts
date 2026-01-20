import Router from "koa-router";
import { z } from "zod";
import { randomUUID } from "crypto";
import auth from "@server/middlewares/authentication";
import { transaction } from "@server/middlewares/transaction";
import { APIContext, AuthenticationType } from "@server/types";
import Logger from "@server/logging/Logger";
import { allTools, ToolName } from "../tools";
import env from "../env";

const router = new Router();

const DEFAULT_PROTOCOL_VERSION = "2025-06-18";
const SUPPORTED_PROTOCOL_VERSIONS = new Set([DEFAULT_PROTOCOL_VERSION]);

type SessionInfo = {
  protocolVersion: string;
  expiresAt: number;
};

const sessionStore = new Map<string, SessionInfo>();
const sessionTtlMs = env.MCP_SESSION_TTL_MINUTES * 60 * 1000;

function parseAllowedOrigins(): string[] {
  if (!env.MCP_ALLOWED_ORIGINS) {
    return [];
  }

  return env.MCP_ALLOWED_ORIGINS.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => {
      if (origin.startsWith("http://") || origin.startsWith("https://")) {
        try {
          return new URL(origin).origin;
        } catch {
          return origin;
        }
      }
      return origin;
    });
}

function isOriginAllowed(origin: string | undefined, allowedOrigins: string[]) {
  if (!origin) {
    return true;
  }

  if (allowedOrigins.length === 0) {
    return false;
  }

  if (allowedOrigins.includes("*")) {
    return true;
  }

  return allowedOrigins.includes(origin);
}

/**
 * CORS middleware for MCP endpoints
 * Validates allowed origins to prevent DNS rebinding attacks.
 */
router.all(/^\/?mcp(\/.*)?$/, async (ctx, next) => {
  const origin = ctx.get("Origin");
  const allowedOrigins = parseAllowedOrigins();

  if (!isOriginAllowed(origin, allowedOrigins)) {
    ctx.status = 403;
    ctx.body = { error: "Origin not allowed" };
    return;
  }

  if (origin) {
    ctx.set("Access-Control-Allow-Origin", origin);
  }
  ctx.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  ctx.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With, Mcp-Session-Id, MCP-Protocol-Version"
  );
  ctx.set("Access-Control-Expose-Headers", "Mcp-Session-Id");
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
const MCP_PROTOCOL_VERSION = DEFAULT_PROTOCOL_VERSION;

// Server info
const SERVER_INFO = {
  name: "outline-mcp",
  version: "1.0.0",
};

/**
 * Build tool definitions for MCP protocol
 */
function unwrapZodSchema(schema: z.ZodTypeAny) {
  let current = schema;
  let defaultValue: unknown = undefined;

  while (
    current._def.typeName === "ZodOptional" ||
    current._def.typeName === "ZodDefault" ||
    current._def.typeName === "ZodNullable"
  ) {
    if (
      current._def.typeName === "ZodDefault" &&
      current._def.defaultValue !== undefined
    ) {
      defaultValue = current._def.defaultValue();
    }
    current = current._def.innerType;
  }

  return { schema: current, defaultValue };
}

function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  const { schema: unwrapped, defaultValue } = unwrapZodSchema(schema);
  const typeName = unwrapped._def.typeName;
  const jsonSchema: Record<string, unknown> = {};

  switch (typeName) {
    case "ZodString": {
      jsonSchema.type = "string";
      if (unwrapped.description) {
        jsonSchema.description = unwrapped.description;
      }
      const checks = unwrapped._def.checks ?? [];
      for (const check of checks) {
        if (check.kind === "min") {
          jsonSchema.minLength = check.value;
        }
        if (check.kind === "max") {
          jsonSchema.maxLength = check.value;
        }
      }
      break;
    }
    case "ZodNumber": {
      jsonSchema.type = "number";
      if (unwrapped.description) {
        jsonSchema.description = unwrapped.description;
      }
      const checks = unwrapped._def.checks ?? [];
      for (const check of checks) {
        if (check.kind === "min") {
          jsonSchema.minimum = check.value;
        }
        if (check.kind === "max") {
          jsonSchema.maximum = check.value;
        }
      }
      break;
    }
    case "ZodBoolean": {
      jsonSchema.type = "boolean";
      if (unwrapped.description) {
        jsonSchema.description = unwrapped.description;
      }
      break;
    }
    case "ZodArray": {
      jsonSchema.type = "array";
      if (unwrapped.description) {
        jsonSchema.description = unwrapped.description;
      }
      jsonSchema.items = zodToJsonSchema(unwrapped._def.type);
      break;
    }
    case "ZodEnum": {
      jsonSchema.type = "string";
      jsonSchema.enum = unwrapped._def.values;
      if (unwrapped.description) {
        jsonSchema.description = unwrapped.description;
      }
      break;
    }
    case "ZodObject": {
      jsonSchema.type = "object";
      const shape = unwrapped.shape;
      jsonSchema.properties = Object.fromEntries(
        Object.entries(shape).map(([key, value]) => [
          key,
          zodToJsonSchema(value),
        ])
      );
      jsonSchema.required = Object.entries(shape)
        .filter(([_, value]) => {
          const zodSchema = value as z.ZodTypeAny;
          const isOptional = zodSchema.isOptional();
          const hasDefault =
            "_def" in zodSchema && zodSchema._def.defaultValue !== undefined;
          return !isOptional && !hasDefault;
        })
        .map(([key]) => key);
      break;
    }
    default: {
      jsonSchema.type = "string";
      if (unwrapped.description) {
        jsonSchema.description = unwrapped.description;
      }
    }
  }

  if (defaultValue !== undefined) {
    jsonSchema.default = defaultValue;
  }

  return jsonSchema;
}

/**
 * Build tool definitions for MCP protocol
 */
function buildToolDefinitions() {
  return Object.entries(allTools).map(([name, tool]) => ({
    name,
    description: tool.description,
    inputSchema: zodToJsonSchema(tool.inputSchema),
  }));
}

function isValidProtocolVersion(version: string | undefined) {
  return !!version && SUPPORTED_PROTOCOL_VERSIONS.has(version);
}

function getSessionInfo(sessionId: string) {
  const session = sessionStore.get(sessionId);
  if (!session) {
    return null;
  }

  if (session.expiresAt <= Date.now()) {
    sessionStore.delete(sessionId);
    return null;
  }

  return session;
}

/**
 * Handle MCP JSON-RPC requests
 * Returns null for notifications (requests without id) per JSON-RPC 2.0 spec
 */
async function handleMcpRequest(
  request: JsonRpcRequest,
  ctx: APIContext
): Promise<JsonRpcResponse | null> {
  const { user } = ctx.state.auth;
  const isNotification = request.id === undefined || request.id === null;

  try {
    switch (request.method) {
      case "initialize": {
        const params = request.params as {
          protocolVersion?: string;
        };
        const requestedVersion = params?.protocolVersion;
        if (!isValidProtocolVersion(requestedVersion)) {
          return {
            jsonrpc: "2.0",
            id: request.id ?? null,
            error: {
              code: -32602,
              message: `Unsupported protocolVersion: ${requestedVersion ?? "none"}`,
            },
          };
        }

        if (isNotification) {
          return null;
        }
        return {
          jsonrpc: "2.0",
          id: request.id,
          result: {
            protocolVersion: requestedVersion ?? MCP_PROTOCOL_VERSION,
            capabilities: {
              tools: {},
            },
            serverInfo: SERVER_INFO,
          },
        };
      }

      case "tools/list": {
        if (isNotification) {
          return null;
        }
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
            id: request.id ?? null,
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
            id: request.id ?? null,
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
            id: request.id ?? null,
            error: {
              code: -32602,
              message: `Invalid tool arguments: ${parseResult.error.message}`,
            },
          };
        }

        Logger.debug("commands", `MCP: Executing tool ${toolName}`, {
          userId: user.id,
          teamId: user.teamId,
        });

        // Execute the tool - data is validated by Zod schema above
        // @ts-expect-error -- dynamic tool dispatch requires type coercion
        const result = await tool.handler(parseResult.data, user, ctx);

        if (isNotification) {
          return null;
        }
        return {
          jsonrpc: "2.0",
          id: request.id,
          result,
        };
      }

      case "ping": {
        if (isNotification) {
          return null;
        }
        return {
          jsonrpc: "2.0",
          id: request.id,
          result: {},
        };
      }

      case "notifications/initialized":
      case "initialized": {
        return null;
      }

      default: {
        if (isNotification) {
          return null;
        }
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

    if (isNotification) {
      return null;
    }
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
 * Compatible with Streamable HTTP transport (2025-06-18 spec)
 */
router.post(
  "mcp",
  auth({
    type: [AuthenticationType.API, AuthenticationType.OAUTH],
  }),
  transaction(),
  async (ctx: APIContext) => {
    if (!env.MCP_ENABLED) {
      ctx.status = 404;
      ctx.body = { error: "MCP server is disabled" };
      return;
    }

    // Set content type for JSON-RPC responses
    ctx.set("Content-Type", "application/json");

    const body = ctx.request.body;

    const protocolVersionHeader = ctx.get("MCP-Protocol-Version");
    const sessionIdHeader = ctx.get("Mcp-Session-Id");

    // Handle batch requests
    if (Array.isArray(body)) {
      // Empty batch is invalid per JSON-RPC 2.0 spec
      if (body.length === 0) {
        ctx.body = {
          jsonrpc: "2.0",
          id: null,
          error: {
            code: -32600,
            message: "Invalid Request: batch must contain at least one request",
          },
        };
        return;
      }

      const includesInitialize = body.some(
        (req: JsonRpcRequest) => req?.method === "initialize"
      );
      const requiresSession = body.some(
        (req: JsonRpcRequest) => req?.method !== "initialize"
      );

      if (requiresSession && !protocolVersionHeader) {
        ctx.status = 400;
        ctx.body = { error: "Missing MCP-Protocol-Version header" };
        return;
      }

      if (requiresSession && !isValidProtocolVersion(protocolVersionHeader)) {
        ctx.status = 400;
        ctx.body = { error: "Unsupported MCP-Protocol-Version header" };
        return;
      }

      if (requiresSession && !sessionIdHeader) {
        ctx.status = 400;
        ctx.body = { error: "Missing Mcp-Session-Id header" };
        return;
      }

      if (requiresSession && sessionIdHeader) {
        const session = getSessionInfo(sessionIdHeader);
        if (!session) {
          ctx.status = 404;
          ctx.body = { error: "MCP session not found" };
          return;
        }
        session.expiresAt = Date.now() + sessionTtlMs;
      }

      const responses = await Promise.all(
        body.map((req: JsonRpcRequest) => {
          // Check if request is a valid object
          if (req === null || typeof req !== "object") {
            return {
              jsonrpc: "2.0",
              id: null,
              error: {
                code: -32600,
                message: "Invalid Request: request must be an object",
              },
            };
          }
          // Validate JSON-RPC version
          if (req.jsonrpc !== "2.0") {
            return {
              jsonrpc: "2.0",
              id: req.id ?? null,
              error: {
                code: -32600,
                message: "Invalid Request: must be JSON-RPC 2.0",
              },
            };
          }
          return handleMcpRequest(req, ctx);
        })
      );
      // Filter out null responses (notifications per JSON-RPC 2.0 spec)
      const filteredResponses = responses.filter((r) => r !== null);
      if (filteredResponses.length > 0) {
        ctx.body = filteredResponses;
      } else {
        // All requests were notifications
        ctx.status = 202;
        ctx.body = "";
      }
      if (includesInitialize && filteredResponses.length > 0) {
        const initializeResponse = filteredResponses.find(
          (response) => response.result?.protocolVersion
        );
        if (initializeResponse?.result) {
          const sessionId = randomUUID();
          sessionStore.set(sessionId, {
            protocolVersion:
              (
                initializeResponse.result as {
                  protocolVersion?: string;
                }
              ).protocolVersion ?? MCP_PROTOCOL_VERSION,
            expiresAt: Date.now() + sessionTtlMs,
          });
          ctx.set("Mcp-Session-Id", sessionId);
          ctx.set("MCP-Protocol-Version", MCP_PROTOCOL_VERSION);
        }
      }
      return;
    }

    // Handle single request
    if (body === null || typeof body !== "object") {
      ctx.body = {
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32600,
          message: "Invalid Request: request must be an object",
        },
      };
      return;
    }

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

    const requestMethod = request.method;
    const isInitialize = requestMethod === "initialize";

    if (!isInitialize && !protocolVersionHeader) {
      ctx.status = 400;
      ctx.body = { error: "Missing MCP-Protocol-Version header" };
      return;
    }

    if (!isInitialize && !isValidProtocolVersion(protocolVersionHeader)) {
      ctx.status = 400;
      ctx.body = { error: "Unsupported MCP-Protocol-Version header" };
      return;
    }

    if (!isInitialize) {
      if (!sessionIdHeader) {
        ctx.status = 400;
        ctx.body = { error: "Missing Mcp-Session-Id header" };
        return;
      }

      const session = getSessionInfo(sessionIdHeader);
      if (!session) {
        ctx.status = 404;
        ctx.body = { error: "MCP session not found" };
        return;
      }

      session.expiresAt = Date.now() + sessionTtlMs;
    }

    const response = await handleMcpRequest(request, ctx);
    if (isInitialize && response?.result) {
      const sessionId = randomUUID();
      sessionStore.set(sessionId, {
        protocolVersion:
          (response.result as { protocolVersion?: string }).protocolVersion ??
          MCP_PROTOCOL_VERSION,
        expiresAt: Date.now() + sessionTtlMs,
      });
      ctx.set("Mcp-Session-Id", sessionId);
      ctx.set("MCP-Protocol-Version", MCP_PROTOCOL_VERSION);
    }
    // JSON-RPC 2.0 spec: servers MUST NOT reply to notifications
    // Streamable HTTP spec: return 202 Accepted for notifications
    if (response !== null) {
      ctx.body = response;
    } else {
      ctx.status = 202;
      ctx.body = "";
    }
  }
);

/**
 * MCP Server-Sent Events endpoint for streaming
 * Used for long-running operations and real-time updates
 */
router.get(
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

    const protocolVersionHeader = ctx.get("MCP-Protocol-Version");
    const sessionIdHeader = ctx.get("Mcp-Session-Id");

    if (!protocolVersionHeader) {
      ctx.status = 400;
      ctx.body = { error: "Missing MCP-Protocol-Version header" };
      return;
    }

    if (!isValidProtocolVersion(protocolVersionHeader)) {
      ctx.status = 400;
      ctx.body = { error: "Unsupported MCP-Protocol-Version header" };
      return;
    }

    if (!sessionIdHeader) {
      ctx.status = 400;
      ctx.body = { error: "Missing Mcp-Session-Id header" };
      return;
    }

    const session = getSessionInfo(sessionIdHeader);
    if (!session) {
      ctx.status = 404;
      ctx.body = { error: "MCP session not found" };
      return;
    }

    session.expiresAt = Date.now() + sessionTtlMs;

    const { user } = ctx.state.auth;

    // Set up SSE headers
    ctx.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    ctx.status = 200;

    Logger.debug("http", "MCP: SSE connection established", {
      userId: user.id,
      sessionId: sessionIdHeader,
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
      Logger.debug("http", "MCP: SSE connection closed", {
        userId: user.id,
        sessionId: sessionIdHeader,
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
