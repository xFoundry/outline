import Router from "koa-router";
import { PassThrough } from "stream";
import { AIProvider } from "@shared/types";
import env from "@server/env";
import { ForbiddenError, ValidationError } from "@server/errors";
import auth from "@server/middlewares/authentication";
import { rateLimiter } from "@server/middlewares/rateLimiter";
import validate from "@server/middlewares/validate";
import { AIConfig, AIConversation, AIUsage } from "@server/models";
import { authorize } from "@server/policies";
import { presentAIConversation, presentAIConfig } from "@server/presenters";
import { APIContext } from "@server/types";
import { RateLimiterStrategy } from "@server/utils/RateLimiter";
import { AIService } from "@server/utils/ai";
import pagination from "../middlewares/pagination";
import * as T from "./schema";

const router = new Router();

/**
 * Helper to set up SSE response headers.
 */
function setupSSE(ctx: APIContext) {
  ctx.set("Content-Type", "text/event-stream");
  ctx.set("Cache-Control", "no-cache");
  ctx.set("Connection", "keep-alive");
  ctx.set("X-Accel-Buffering", "no"); // Disable nginx buffering

  const stream = new PassThrough();
  ctx.body = stream;
  ctx.status = 200;

  return stream;
}

/**
 * Send an SSE event.
 */
function sendSSE(
  stream: PassThrough,
  event: string,
  data: unknown
): void {
  stream.write(`event: ${event}\n`);
  stream.write(`data: ${JSON.stringify(data)}\n\n`);
}

// ============ Chat Endpoints ============

router.post(
  "ai.chat",
  rateLimiter(RateLimiterStrategy.TenPerMinute),
  auth(),
  validate(T.AIChatSchema),
  async (ctx: APIContext<T.AIChatReq>) => {
    const { message, conversationId, documentId, model, provider } = ctx.input.body;
    const { user } = ctx.state.auth;

    // Check if AI is enabled globally
    if (!env.AI_ENABLED) {
      throw ForbiddenError("AI features are not enabled");
    }

    // Initialize AI service
    const aiService = new AIService({
      user,
      team: user.team,
      ip: ctx.ip,
    });
    await aiService.initialize();

    // Check if AI is enabled for this team
    if (!aiService.isEnabled()) {
      throw ForbiddenError("AI is not enabled for this workspace");
    }

    // Check feature permission
    if (!aiService.isFeatureEnabled("chat")) {
      throw ForbiddenError("Chat feature is not enabled");
    }

    // Set up SSE stream
    const stream = setupSSE(ctx);

    // Handle client disconnect
    const abortController = new AbortController();
    ctx.req.on("close", () => {
      abortController.abort();
    });

    try {
      await aiService.streamChat(
        {
          message,
          conversationId,
          documentId,
          model,
          provider,
          signal: abortController.signal,
        },
        {
          onStart: () => {
            sendSSE(stream, "start", { status: "started" });
          },
          onToken: (token) => {
            sendSSE(stream, "token", { token });
          },
          onToolCall: (toolCall) => {
            sendSSE(stream, "tool_call", toolCall);
          },
          onToolResult: (result) => {
            sendSSE(stream, "tool_result", result);
          },
          onFinish: (result) => {
            sendSSE(stream, "finish", {
              text: result.text,
              usage: result.usage,
            });
            stream.end();
          },
          onError: (error) => {
            sendSSE(stream, "error", { message: error.message });
            stream.end();
          },
        }
      );
    } catch (error) {
      sendSSE(stream, "error", {
        message: error instanceof Error ? error.message : "Unknown error",
      });
      stream.end();
    }
  }
);

router.post(
  "ai.edit",
  rateLimiter(RateLimiterStrategy.TenPerMinute),
  auth(),
  validate(T.AIEditSchema),
  async (ctx: APIContext<T.AIEditReq>) => {
    const { content, instruction, operation, model, provider } = ctx.input.body;
    const { user } = ctx.state.auth;

    // Check if AI is enabled globally
    if (!env.AI_ENABLED) {
      throw ForbiddenError("AI features are not enabled");
    }

    // Initialize AI service
    const aiService = new AIService({
      user,
      team: user.team,
      ip: ctx.ip,
    });
    await aiService.initialize();

    // Check if AI is enabled for this team
    if (!aiService.isEnabled()) {
      throw ForbiddenError("AI is not enabled for this workspace");
    }

    // Check feature permission
    if (!aiService.isFeatureEnabled("editing")) {
      throw ForbiddenError("Editing feature is not enabled");
    }

    // Set up SSE stream
    const stream = setupSSE(ctx);

    // Handle client disconnect
    const abortController = new AbortController();
    ctx.req.on("close", () => {
      abortController.abort();
    });

    try {
      await aiService.streamEdit(
        {
          content,
          instruction,
          operation,
          model,
          provider,
          signal: abortController.signal,
        },
        {
          onStart: () => {
            sendSSE(stream, "start", { status: "started" });
          },
          onToken: (token) => {
            sendSSE(stream, "token", { token });
          },
          onFinish: (result) => {
            sendSSE(stream, "finish", {
              text: result.text,
              usage: result.usage,
            });
            stream.end();
          },
          onError: (error) => {
            sendSSE(stream, "error", { message: error.message });
            stream.end();
          },
        }
      );
    } catch (error) {
      sendSSE(stream, "error", {
        message: error instanceof Error ? error.message : "Unknown error",
      });
      stream.end();
    }
  }
);

// ============ Models Endpoints ============

router.post(
  "ai.models",
  auth(),
  validate(T.AIModelsListSchema),
  async (ctx: APIContext<T.AIModelsListReq>) => {
    const { provider } = ctx.input.body;
    const { user } = ctx.state.auth;

    // Check if AI is enabled globally
    if (!env.AI_ENABLED) {
      throw ForbiddenError("AI features are not enabled");
    }

    // Initialize AI service
    const aiService = new AIService({
      user,
      team: user.team,
      ip: ctx.ip,
    });
    await aiService.initialize();

    const models = await aiService.listModels();

    // Filter by provider if specified
    const filteredModels = provider
      ? models.filter((m) => m.provider === provider)
      : models;

    ctx.body = {
      data: filteredModels,
    };
  }
);

// ============ Conversation Endpoints ============

router.post(
  "ai.conversations.list",
  auth(),
  pagination(),
  validate(T.AIConversationsListSchema),
  async (ctx: APIContext<T.AIConversationsListReq>) => {
    const { documentId, limit, offset } = ctx.input.body;
    const { user } = ctx.state.auth;

    const where: Record<string, unknown> = {
      userId: user.id,
      teamId: user.teamId,
    };

    if (documentId) {
      where.documentId = documentId;
    }

    const [conversations, total] = await Promise.all([
      AIConversation.findAll({
        where,
        order: [["lastMessageAt", "DESC"]],
        limit,
        offset,
      }),
      AIConversation.count({ where }),
    ]);

    ctx.body = {
      pagination: { ...ctx.state.pagination, total },
      data: conversations.map((c) => presentAIConversation(c)),
    };
  }
);

router.post(
  "ai.conversations.info",
  auth(),
  validate(T.AIConversationInfoSchema),
  async (ctx: APIContext<T.AIConversationInfoReq>) => {
    const { id, includeMessages } = ctx.input.body;
    const { user } = ctx.state.auth;

    const conversation = await AIConversation.findOne({
      where: {
        id,
        userId: user.id,
        teamId: user.teamId,
      },
      rejectOnEmpty: true,
    });

    ctx.body = {
      data: presentAIConversation(conversation, { includeMessages }),
    };
  }
);

router.post(
  "ai.conversations.delete",
  auth(),
  validate(T.AIConversationDeleteSchema),
  async (ctx: APIContext<T.AIConversationDeleteReq>) => {
    const { id } = ctx.input.body;
    const { user } = ctx.state.auth;

    const deleted = await AIConversation.destroy({
      where: {
        id,
        userId: user.id,
        teamId: user.teamId,
      },
    });

    if (deleted === 0) {
      throw ValidationError("Conversation not found");
    }

    ctx.body = {
      success: true,
    };
  }
);

// ============ Config Endpoints (Admin) ============

router.post(
  "ai.config.info",
  auth({ admin: true }),
  validate(T.AIConfigInfoSchema),
  async (ctx: APIContext<T.AIConfigInfoReq>) => {
    const { user } = ctx.state.auth;

    let config = await AIConfig.findOne({
      where: { teamId: user.teamId },
    });

    // Create default config if none exists
    if (!config) {
      config = await AIConfig.create({
        teamId: user.teamId,
        enabled: false,
      });
    }

    ctx.body = {
      data: presentAIConfig(config, { includeSensitive: true }),
    };
  }
);

router.post(
  "ai.config.update",
  auth({ admin: true }),
  validate(T.AIConfigUpdateSchema),
  async (ctx: APIContext<T.AIConfigUpdateReq>) => {
    const {
      enabled,
      providers,
      defaultModels,
      availableModels,
      permissions,
      rateLimits,
    } = ctx.input.body;
    const { user } = ctx.state.auth;

    let [config] = await AIConfig.findOrCreate({
      where: { teamId: user.teamId },
      defaults: {
        teamId: user.teamId,
        enabled: false,
      },
    });

    // Update basic fields
    if (enabled !== undefined) {
      config.enabled = enabled;
    }

    if (defaultModels !== undefined) {
      config.defaultModels = {
        ...config.defaultModels,
        ...defaultModels,
      };
    }

    if (availableModels !== undefined) {
      config.availableModels = {
        ...config.availableModels,
        ...availableModels,
      };
    }

    if (permissions !== undefined) {
      config.permissions = {
        ...config.permissions,
        ...permissions,
      };
    }

    if (rateLimits !== undefined) {
      config.rateLimits = {
        ...config.rateLimits,
        ...rateLimits,
      };
    }

    // Handle provider updates (including API keys)
    if (providers !== undefined) {
      const currentProviders = config.getProvidersConfig();

      if (providers[AIProvider.OpenRouter]) {
        currentProviders[AIProvider.OpenRouter] = {
          ...currentProviders[AIProvider.OpenRouter],
          enabled: providers[AIProvider.OpenRouter].enabled,
          // Only update API key if provided
          ...(providers[AIProvider.OpenRouter].apiKey !== undefined && {
            apiKey: providers[AIProvider.OpenRouter].apiKey,
          }),
        };
      }

      if (providers[AIProvider.OpenAI]) {
        currentProviders[AIProvider.OpenAI] = {
          ...currentProviders[AIProvider.OpenAI],
          enabled: providers[AIProvider.OpenAI].enabled,
          // Only update API key if provided
          ...(providers[AIProvider.OpenAI].apiKey !== undefined && {
            apiKey: providers[AIProvider.OpenAI].apiKey,
          }),
        };
      }

      config.setProvidersConfig(currentProviders);
    }

    await config.save();

    ctx.body = {
      data: presentAIConfig(config, { includeSensitive: true }),
    };
  }
);

// ============ Usage Endpoints (Admin) ============

router.post(
  "ai.usage",
  auth({ admin: true }),
  validate(T.AIUsageStatsSchema),
  async (ctx: APIContext<T.AIUsageStatsReq>) => {
    const { startDate, endDate } = ctx.input.body;
    const { user } = ctx.state.auth;

    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    const usage = await AIUsage.getTeamUsage(user.teamId, start, end);

    ctx.body = {
      data: {
        ...usage,
        totalTokens: usage.inputTokens + usage.outputTokens,
        period: {
          start: start.toISOString(),
          end: end.toISOString(),
        },
      },
    };
  }
);

export default router;
