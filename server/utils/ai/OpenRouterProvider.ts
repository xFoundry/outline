import { streamText, tool } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { z } from "zod";
import { AIProvider, AIOperationType } from "@shared/types";
import env from "@server/env";
import {
  BaseProvider,
  AIStreamCallbacks,
  AITool,
  AIChatOptions,
  AIEditOptions,
  AIStreamResult,
  AIModelInfo,
} from "./BaseProvider";

// Popular models available through OpenRouter
const OPENROUTER_MODELS: AIModelInfo[] = [
  {
    id: "anthropic/claude-3.5-sonnet",
    name: "Claude 3.5 Sonnet",
    provider: AIProvider.OpenRouter,
    contextLength: 200000,
    supportsTools: true,
    supportsStreaming: true,
    pricing: { inputPerMillion: 3, outputPerMillion: 15 },
  },
  {
    id: "anthropic/claude-3-opus",
    name: "Claude 3 Opus",
    provider: AIProvider.OpenRouter,
    contextLength: 200000,
    supportsTools: true,
    supportsStreaming: true,
    pricing: { inputPerMillion: 15, outputPerMillion: 75 },
  },
  {
    id: "anthropic/claude-3-haiku",
    name: "Claude 3 Haiku",
    provider: AIProvider.OpenRouter,
    contextLength: 200000,
    supportsTools: true,
    supportsStreaming: true,
    pricing: { inputPerMillion: 0.25, outputPerMillion: 1.25 },
  },
  {
    id: "openai/gpt-4o",
    name: "GPT-4o (via OpenRouter)",
    provider: AIProvider.OpenRouter,
    contextLength: 128000,
    supportsTools: true,
    supportsStreaming: true,
    pricing: { inputPerMillion: 5, outputPerMillion: 15 },
  },
  {
    id: "openai/gpt-4o-mini",
    name: "GPT-4o Mini (via OpenRouter)",
    provider: AIProvider.OpenRouter,
    contextLength: 128000,
    supportsTools: true,
    supportsStreaming: true,
    pricing: { inputPerMillion: 0.15, outputPerMillion: 0.6 },
  },
  {
    id: "google/gemini-pro-1.5",
    name: "Gemini 1.5 Pro",
    provider: AIProvider.OpenRouter,
    contextLength: 1000000,
    supportsTools: true,
    supportsStreaming: true,
    pricing: { inputPerMillion: 3.5, outputPerMillion: 10.5 },
  },
  {
    id: "google/gemini-flash-1.5",
    name: "Gemini 1.5 Flash",
    provider: AIProvider.OpenRouter,
    contextLength: 1000000,
    supportsTools: true,
    supportsStreaming: true,
    pricing: { inputPerMillion: 0.075, outputPerMillion: 0.3 },
  },
  {
    id: "meta-llama/llama-3.1-70b-instruct",
    name: "Llama 3.1 70B",
    provider: AIProvider.OpenRouter,
    contextLength: 131072,
    supportsTools: true,
    supportsStreaming: true,
    pricing: { inputPerMillion: 0.52, outputPerMillion: 0.75 },
  },
  {
    id: "mistralai/mixtral-8x22b-instruct",
    name: "Mixtral 8x22B",
    provider: AIProvider.OpenRouter,
    contextLength: 65536,
    supportsTools: true,
    supportsStreaming: true,
    pricing: { inputPerMillion: 0.9, outputPerMillion: 0.9 },
  },
  {
    id: "deepseek/deepseek-chat",
    name: "DeepSeek Chat",
    provider: AIProvider.OpenRouter,
    contextLength: 65536,
    supportsTools: true,
    supportsStreaming: true,
    pricing: { inputPerMillion: 0.14, outputPerMillion: 0.28 },
  },
];

const OPERATION_PROMPTS: Record<AIOperationType, string> = {
  [AIOperationType.Rephrase]:
    "Rephrase the following text to improve clarity and readability while maintaining the original meaning:",
  [AIOperationType.Expand]:
    "Expand and elaborate on the following text with more details and context:",
  [AIOperationType.Simplify]:
    "Simplify the following text to make it easier to understand, using simpler words and shorter sentences:",
  [AIOperationType.FixGrammar]:
    "Fix any grammar, spelling, and punctuation errors in the following text:",
  [AIOperationType.Translate]:
    "Translate the following text:", // Language will be appended
  [AIOperationType.Continue]:
    "Continue writing from where the following text ends, maintaining the same style and tone:",
  [AIOperationType.Summarize]:
    "Summarize the following text concisely while capturing the key points:",
  [AIOperationType.Custom]: "", // Custom instruction will be used directly
};

/**
 * OpenRouter provider implementation using the Vercel AI SDK.
 * OpenRouter provides access to multiple AI models through a single API.
 */
export class OpenRouterProvider extends BaseProvider {
  private apiKey: string | undefined;
  private client: ReturnType<typeof createOpenRouter> | null = null;

  constructor(apiKey?: string) {
    super(AIProvider.OpenRouter);
    this.apiKey = apiKey || env.OPENROUTER_API_KEY;

    if (this.apiKey) {
      this.client = createOpenRouter({
        apiKey: this.apiKey,
      });
    }
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  getDefaultModel(): string {
    return env.AI_DEFAULT_CHAT_MODEL || "anthropic/claude-3.5-sonnet";
  }

  getModel(modelId: string) {
    if (!this.client) {
      throw new Error("OpenRouter provider is not configured");
    }
    return this.client(modelId);
  }

  async listModels(): Promise<AIModelInfo[]> {
    // In a production environment, you could fetch this from OpenRouter's API
    // GET https://openrouter.ai/api/v1/models
    return OPENROUTER_MODELS;
  }

  private convertTools(tools: AITool[]): Record<string, ReturnType<typeof tool>> {
    const result: Record<string, ReturnType<typeof tool>> = {};

    for (const t of tools) {
      // Convert parameters to Zod schema
      const schema = z.object(t.parameters as z.ZodRawShape);

      result[t.name] = tool({
        description: t.description,
        parameters: schema,
        execute: async (args) => t.execute(args),
      });
    }

    return result;
  }

  async streamChat(
    options: AIChatOptions,
    callbacks: AIStreamCallbacks
  ): Promise<AIStreamResult> {
    if (!this.client) {
      throw new Error("OpenRouter provider is not configured");
    }

    const model = this.getModel(options.model);

    const messages = options.systemPrompt
      ? [{ role: "system" as const, content: options.systemPrompt }, ...options.messages]
      : options.messages;

    const tools = options.tools ? this.convertTools(options.tools) : undefined;

    callbacks.onStart?.();

    const result = streamText({
      model,
      messages,
      tools,
      maxTokens: options.config?.maxTokens || env.AI_MAX_TOKENS,
      temperature: options.config?.temperature ?? 0.7,
      topP: options.config?.topP,
      frequencyPenalty: options.config?.frequencyPenalty,
      presencePenalty: options.config?.presencePenalty,
      stopSequences: options.config?.stopSequences,
      abortSignal: options.signal,
    });

    // Consume the stream to trigger callbacks
    let fullText = "";
    for await (const chunk of result.textStream) {
      fullText += chunk;
      callbacks.onToken?.(chunk);
    }

    // Get final usage stats
    const usage = await result.usage;
    callbacks.onFinish?.({
      text: fullText,
      usage: {
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
      },
    });

    return {
      textStream: result.textStream,
      usage: Promise.resolve({
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
      }),
    };
  }

  async streamEdit(
    options: AIEditOptions,
    callbacks: AIStreamCallbacks
  ): Promise<AIStreamResult> {
    if (!this.client) {
      throw new Error("OpenRouter provider is not configured");
    }

    const model = this.getModel(options.model);

    let systemPrompt = OPERATION_PROMPTS[options.operation];
    if (options.operation === AIOperationType.Custom) {
      systemPrompt = options.instruction;
    }

    const userContent = options.operation === AIOperationType.Custom
      ? options.content
      : `${systemPrompt}\n\n${options.content}`;

    callbacks.onStart?.();

    const result = streamText({
      model,
      messages: [
        {
          role: "system",
          content:
            "You are a helpful writing assistant. Only output the modified text without any explanations or markdown formatting unless the original text uses it.",
        },
        {
          role: "user",
          content: userContent,
        },
      ],
      maxTokens: options.config?.maxTokens || env.AI_MAX_TOKENS,
      temperature: options.config?.temperature ?? 0.7,
      abortSignal: options.signal,
    });

    // Consume the stream to trigger callbacks
    let fullText = "";
    for await (const chunk of result.textStream) {
      fullText += chunk;
      callbacks.onToken?.(chunk);
    }

    // Get final usage stats
    const usage = await result.usage;
    callbacks.onFinish?.({
      text: fullText,
      usage: {
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
      },
    });

    return {
      textStream: result.textStream,
      usage: Promise.resolve({
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
      }),
    };
  }
}

export default OpenRouterProvider;
