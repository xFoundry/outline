import { z } from "zod";
import { AIProvider, AIFeature, AIOperationType } from "@shared/types";
import { BaseSchema } from "@server/routes/api/schema";

// ============ Chat Schemas ============

export const AIChatSchema = BaseSchema.extend({
  body: z.object({
    /** Message content */
    message: z.string().min(1).max(32000),

    /** Optional conversation ID to continue */
    conversationId: z.string().uuid().optional(),

    /** Optional document ID for context */
    documentId: z.string().uuid().optional(),

    /** Optional model ID */
    model: z.string().optional(),

    /** Optional provider */
    provider: z.nativeEnum(AIProvider).optional(),
  }),
});

export type AIChatReq = z.infer<typeof AIChatSchema>;

export const AIEditSchema = BaseSchema.extend({
  body: z.object({
    /** Content to edit */
    content: z.string().min(1).max(32000),

    /** Instruction for editing */
    instruction: z.string().max(2000).default(""),

    /** Operation type */
    operation: z.nativeEnum(AIOperationType),

    /** Optional model ID */
    model: z.string().optional(),

    /** Optional provider */
    provider: z.nativeEnum(AIProvider).optional(),
  }),
});

export type AIEditReq = z.infer<typeof AIEditSchema>;

// ============ Conversation Schemas ============

export const AIConversationsListSchema = BaseSchema.extend({
  body: z.object({
    /** Optional document ID to filter conversations */
    documentId: z.string().uuid().optional(),

    /** Limit results */
    limit: z.number().min(1).max(100).default(50),

    /** Offset for pagination */
    offset: z.number().min(0).default(0),
  }),
});

export type AIConversationsListReq = z.infer<typeof AIConversationsListSchema>;

export const AIConversationInfoSchema = BaseSchema.extend({
  body: z.object({
    /** Conversation ID */
    id: z.string().uuid(),

    /** Whether to include messages */
    includeMessages: z.boolean().default(true),
  }),
});

export type AIConversationInfoReq = z.infer<typeof AIConversationInfoSchema>;

export const AIConversationDeleteSchema = BaseSchema.extend({
  body: z.object({
    /** Conversation ID */
    id: z.string().uuid(),
  }),
});

export type AIConversationDeleteReq = z.infer<typeof AIConversationDeleteSchema>;

// ============ Models Schemas ============

export const AIModelsListSchema = BaseSchema.extend({
  body: z.object({
    /** Optional provider filter */
    provider: z.nativeEnum(AIProvider).optional(),
  }),
});

export type AIModelsListReq = z.infer<typeof AIModelsListSchema>;

// ============ Config Schemas (Admin) ============

export const AIConfigInfoSchema = BaseSchema.extend({
  body: z.object({}),
});

export type AIConfigInfoReq = z.infer<typeof AIConfigInfoSchema>;

export const AIConfigUpdateSchema = BaseSchema.extend({
  body: z.object({
    /** Enable/disable AI for the team */
    enabled: z.boolean().optional(),

    /** Provider configurations */
    providers: z
      .object({
        [AIProvider.OpenRouter]: z
          .object({
            enabled: z.boolean(),
            apiKey: z.string().optional(),
          })
          .optional(),
        [AIProvider.OpenAI]: z
          .object({
            enabled: z.boolean(),
            apiKey: z.string().optional(),
          })
          .optional(),
      })
      .optional(),

    /** Default models */
    defaultModels: z
      .object({
        chat: z.string().optional(),
        edit: z.string().optional(),
      })
      .optional(),

    /** Available models whitelist */
    availableModels: z
      .object({
        [AIProvider.OpenRouter]: z.array(z.string()).optional(),
        [AIProvider.OpenAI]: z.array(z.string()).optional(),
      })
      .optional(),

    /** Permissions */
    permissions: z
      .object({
        enabledFor: z.enum(["all", "admins", "groups"]),
        groupIds: z.array(z.string().uuid()).optional(),
        features: z.object({
          [AIFeature.Chat]: z.boolean(),
          [AIFeature.Editing]: z.boolean(),
          [AIFeature.Generation]: z.boolean(),
        }),
      })
      .optional(),

    /** Rate limits */
    rateLimits: z
      .object({
        requestsPerMinute: z.number().min(1).max(1000),
        tokensPerDay: z.number().min(1000).max(10000000),
        tokensPerMonth: z.number().min(10000).max(100000000),
      })
      .optional(),
  }),
});

export type AIConfigUpdateReq = z.infer<typeof AIConfigUpdateSchema>;

// ============ Usage Schemas ============

export const AIUsageStatsSchema = BaseSchema.extend({
  body: z.object({
    /** Start date for the usage period */
    startDate: z.string().datetime().optional(),

    /** End date for the usage period */
    endDate: z.string().datetime().optional(),
  }),
});

export type AIUsageStatsReq = z.infer<typeof AIUsageStatsSchema>;
