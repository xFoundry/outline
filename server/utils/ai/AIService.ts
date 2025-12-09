import { CoreMessage } from "ai";
import {
  AIProvider,
  AIOperationType,
  AIMessageRole,
  AIMessageData,
} from "@shared/types";
import env from "@server/env";
import { AIConfig, AIConversation, AIUsage, User, Team } from "@server/models";
import Logger from "@server/logging/Logger";
import {
  BaseProvider,
  AIStreamCallbacks,
  AITool,
  AIModelConfig,
  AIModelInfo,
} from "./BaseProvider";
import { OpenAIProvider } from "./OpenAIProvider";
import { OpenRouterProvider } from "./OpenRouterProvider";

export type ChatRequestOptions = {
  conversationId?: string;
  documentId?: string;
  message: string;
  model?: string;
  provider?: AIProvider;
  tools?: AITool[];
  config?: AIModelConfig;
  signal?: AbortSignal;
};

export type EditRequestOptions = {
  content: string;
  instruction: string;
  operation: AIOperationType;
  model?: string;
  provider?: AIProvider;
  config?: AIModelConfig;
  signal?: AbortSignal;
};

export type AIServiceContext = {
  user: User;
  team: Team;
  ip: string;
};

/**
 * Main AI service that orchestrates provider selection, rate limiting,
 * and conversation management.
 */
export class AIService {
  private providers: Map<AIProvider, BaseProvider> = new Map();
  private context: AIServiceContext;
  private aiConfig: AIConfig | null = null;

  constructor(context: AIServiceContext) {
    this.context = context;
  }

  /**
   * Initialize the service by loading team configuration and setting up providers.
   */
  async initialize(): Promise<void> {
    // Load team AI configuration
    this.aiConfig = await AIConfig.findOne({
      where: { teamId: this.context.team.id },
    });

    // Initialize providers based on configuration
    await this.initializeProviders();
  }

  private async initializeProviders(): Promise<void> {
    // Get API keys from team config or fall back to environment variables
    const openRouterKey = this.aiConfig?.getProviderApiKey(AIProvider.OpenRouter);
    const openAIKey = this.aiConfig?.getProviderApiKey(AIProvider.OpenAI);

    // Initialize OpenRouter provider
    if (openRouterKey || env.OPENROUTER_API_KEY) {
      this.providers.set(AIProvider.OpenRouter, new OpenRouterProvider(openRouterKey));
    }

    // Initialize OpenAI provider
    if (openAIKey || env.OPENAI_API_KEY) {
      this.providers.set(AIProvider.OpenAI, new OpenAIProvider(openAIKey));
    }
  }

  /**
   * Check if AI is enabled for this team.
   */
  isEnabled(): boolean {
    // Check environment variable first
    if (!env.AI_ENABLED) {
      return false;
    }

    // If no team config, use environment default
    if (!this.aiConfig) {
      return this.providers.size > 0;
    }

    return this.aiConfig.enabled;
  }

  /**
   * Check if a specific feature is enabled.
   */
  isFeatureEnabled(feature: "chat" | "editing" | "generation"): boolean {
    if (!this.isEnabled()) {
      return false;
    }

    if (!this.aiConfig) {
      return true; // Default to enabled if no config
    }

    return this.aiConfig.isFeatureEnabled(feature);
  }

  /**
   * Get the default provider.
   */
  getDefaultProvider(): AIProvider {
    // Check team config first
    if (this.aiConfig) {
      const config = this.aiConfig.getProvidersConfig();
      for (const provider of [AIProvider.OpenRouter, AIProvider.OpenAI]) {
        if (config[provider]?.enabled) {
          return provider;
        }
      }
    }

    // Fall back to environment configuration
    if (env.AI_DEFAULT_PROVIDER === "openai" && this.providers.has(AIProvider.OpenAI)) {
      return AIProvider.OpenAI;
    }

    if (this.providers.has(AIProvider.OpenRouter)) {
      return AIProvider.OpenRouter;
    }

    if (this.providers.has(AIProvider.OpenAI)) {
      return AIProvider.OpenAI;
    }

    throw new Error("No AI provider configured");
  }

  /**
   * Get a provider instance.
   */
  getProvider(provider?: AIProvider): BaseProvider {
    const selectedProvider = provider || this.getDefaultProvider();
    const providerInstance = this.providers.get(selectedProvider);

    if (!providerInstance) {
      throw new Error(`Provider ${selectedProvider} is not configured`);
    }

    return providerInstance;
  }

  /**
   * List available models from all configured providers.
   */
  async listModels(): Promise<AIModelInfo[]> {
    const models: AIModelInfo[] = [];

    for (const [, provider] of this.providers) {
      const providerModels = await provider.listModels();

      // Filter by available models if whitelist is configured
      if (this.aiConfig?.availableModels) {
        const whitelist = this.aiConfig.availableModels[provider.provider];
        if (whitelist && whitelist.length > 0) {
          models.push(...providerModels.filter((m) => whitelist.includes(m.id)));
        } else {
          models.push(...providerModels);
        }
      } else {
        models.push(...providerModels);
      }
    }

    return models;
  }

  /**
   * Check rate limits before making a request.
   */
  async checkRateLimits(): Promise<{
    allowed: boolean;
    reason?: string;
  }> {
    const limits = this.aiConfig?.rateLimits ?? {
      requestsPerMinute: env.AI_RATE_LIMIT_REQUESTS_PER_MINUTE,
      tokensPerDay: env.AI_RATE_LIMIT_TOKENS_PER_DAY,
      tokensPerMonth: 2000000,
    };

    return AIUsage.checkRateLimits(
      this.context.user.id,
      this.context.team.id,
      limits
    );
  }

  /**
   * Record usage after a request completes.
   */
  private async recordUsage(options: {
    conversationId?: string;
    provider: AIProvider;
    model: string;
    inputTokens: number;
    outputTokens: number;
    operationType: AIOperationType | "chat";
  }): Promise<void> {
    try {
      await AIUsage.create({
        teamId: this.context.team.id,
        userId: this.context.user.id,
        conversationId: options.conversationId,
        provider: options.provider,
        model: options.model,
        inputTokens: options.inputTokens,
        outputTokens: options.outputTokens,
        operationType: options.operationType as AIOperationType,
      });
    } catch (error) {
      Logger.error("Failed to record AI usage", error);
    }
  }

  /**
   * Stream a chat response.
   */
  async streamChat(
    options: ChatRequestOptions,
    callbacks: AIStreamCallbacks
  ): Promise<void> {
    // Check rate limits
    const rateLimitCheck = await this.checkRateLimits();
    if (!rateLimitCheck.allowed) {
      callbacks.onError?.(new Error(rateLimitCheck.reason));
      return;
    }

    const provider = this.getProvider(options.provider);
    const model = options.model || provider.getDefaultModel();

    // Load or create conversation
    let conversation: AIConversation | null = null;
    if (options.conversationId) {
      conversation = await AIConversation.findOne({
        where: {
          id: options.conversationId,
          userId: this.context.user.id,
          teamId: this.context.team.id,
        },
      });
    }

    if (!conversation) {
      conversation = await AIConversation.create({
        userId: this.context.user.id,
        teamId: this.context.team.id,
        documentId: options.documentId,
        type: "chat",
        messages: [],
        metadata: {
          model,
          provider: provider.provider,
          totalTokens: 0,
        },
      });
    }

    // Add user message to conversation
    const userMessage: AIMessageData = {
      role: AIMessageRole.User,
      content: options.message,
      createdAt: new Date().toISOString(),
    };
    conversation.addMessage(userMessage);

    // Convert messages to CoreMessage format
    const coreMessages: CoreMessage[] = conversation.messages.map((m) => ({
      role: m.role as "user" | "assistant" | "system" | "tool",
      content: m.content,
    }));

    // Track accumulated text for the response
    let responseText = "";
    let usage = { promptTokens: 0, completionTokens: 0 };

    const wrappedCallbacks: AIStreamCallbacks = {
      ...callbacks,
      onToken: (token) => {
        responseText += token;
        callbacks.onToken?.(token);
      },
      onFinish: async (result) => {
        usage = result.usage;

        // Add assistant message to conversation
        const assistantMessage: AIMessageData = {
          role: AIMessageRole.Assistant,
          content: result.text,
          createdAt: new Date().toISOString(),
        };
        conversation!.addMessage(assistantMessage);
        conversation!.updateTokenCount(usage.promptTokens, usage.completionTokens);

        // Generate title if this is the first exchange
        if (conversation!.messages.length === 2 && !conversation!.title) {
          conversation!.title = conversation!.generateTitle();
        }

        await conversation!.save();

        // Record usage
        await this.recordUsage({
          conversationId: conversation!.id,
          provider: provider.provider,
          model,
          inputTokens: usage.promptTokens,
          outputTokens: usage.completionTokens,
          operationType: "chat",
        });

        callbacks.onFinish?.(result);
      },
      onError: (error) => {
        Logger.error("AI chat error", error);
        callbacks.onError?.(error);
      },
    };

    // Build system prompt based on context
    let systemPrompt =
      "You are a helpful AI assistant integrated into Outline, a knowledge management application. " +
      "You help users with writing, editing, and finding information. " +
      "Be concise and helpful in your responses.";

    // Add document context if available
    if (options.documentId) {
      systemPrompt +=
        "\n\nThe user is currently viewing a document. They may ask questions about it or request help with editing.";
    }

    await provider.streamChat(
      {
        messages: coreMessages,
        model,
        systemPrompt,
        tools: options.tools,
        config: options.config,
        signal: options.signal,
      },
      wrappedCallbacks
    );
  }

  /**
   * Stream an edit response.
   */
  async streamEdit(
    options: EditRequestOptions,
    callbacks: AIStreamCallbacks
  ): Promise<void> {
    // Check rate limits
    const rateLimitCheck = await this.checkRateLimits();
    if (!rateLimitCheck.allowed) {
      callbacks.onError?.(new Error(rateLimitCheck.reason));
      return;
    }

    const provider = this.getProvider(options.provider);
    const model = options.model ||
      this.aiConfig?.getDefaultModel("edit") ||
      provider.getDefaultModel();

    let usage = { promptTokens: 0, completionTokens: 0 };

    const wrappedCallbacks: AIStreamCallbacks = {
      ...callbacks,
      onFinish: async (result) => {
        usage = result.usage;

        // Record usage
        await this.recordUsage({
          provider: provider.provider,
          model,
          inputTokens: usage.promptTokens,
          outputTokens: usage.completionTokens,
          operationType: options.operation,
        });

        callbacks.onFinish?.(result);
      },
      onError: (error) => {
        Logger.error("AI edit error", error);
        callbacks.onError?.(error);
      },
    };

    await provider.streamEdit(
      {
        content: options.content,
        instruction: options.instruction,
        operation: options.operation,
        model,
        config: options.config,
        signal: options.signal,
      },
      wrappedCallbacks
    );
  }

  /**
   * Get conversation history for the current user.
   */
  async getConversations(options: {
    limit?: number;
    offset?: number;
    documentId?: string;
  }): Promise<AIConversation[]> {
    const where: Record<string, unknown> = {
      userId: this.context.user.id,
      teamId: this.context.team.id,
    };

    if (options.documentId) {
      where.documentId = options.documentId;
    }

    return AIConversation.findAll({
      where,
      order: [["lastMessageAt", "DESC"]],
      limit: options.limit ?? 50,
      offset: options.offset ?? 0,
    });
  }

  /**
   * Get a specific conversation.
   */
  async getConversation(conversationId: string): Promise<AIConversation | null> {
    return AIConversation.findOne({
      where: {
        id: conversationId,
        userId: this.context.user.id,
        teamId: this.context.team.id,
      },
    });
  }

  /**
   * Delete a conversation.
   */
  async deleteConversation(conversationId: string): Promise<boolean> {
    const deleted = await AIConversation.destroy({
      where: {
        id: conversationId,
        userId: this.context.user.id,
        teamId: this.context.team.id,
      },
    });

    return deleted > 0;
  }
}

export default AIService;
