import { streamText, tool } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
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

const OPENAI_MODELS: AIModelInfo[] = [
  {
    id: "gpt-4o",
    name: "GPT-4o",
    provider: AIProvider.OpenAI,
    contextLength: 128000,
    supportsTools: true,
    supportsStreaming: true,
    pricing: { inputPerMillion: 5, outputPerMillion: 15 },
  },
  {
    id: "gpt-4o-mini",
    name: "GPT-4o Mini",
    provider: AIProvider.OpenAI,
    contextLength: 128000,
    supportsTools: true,
    supportsStreaming: true,
    pricing: { inputPerMillion: 0.15, outputPerMillion: 0.6 },
  },
  {
    id: "gpt-4-turbo",
    name: "GPT-4 Turbo",
    provider: AIProvider.OpenAI,
    contextLength: 128000,
    supportsTools: true,
    supportsStreaming: true,
    pricing: { inputPerMillion: 10, outputPerMillion: 30 },
  },
  {
    id: "gpt-3.5-turbo",
    name: "GPT-3.5 Turbo",
    provider: AIProvider.OpenAI,
    contextLength: 16385,
    supportsTools: true,
    supportsStreaming: true,
    pricing: { inputPerMillion: 0.5, outputPerMillion: 1.5 },
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
 * OpenAI provider implementation using the Vercel AI SDK.
 */
export class OpenAIProvider extends BaseProvider {
  private apiKey: string | undefined;
  private client: ReturnType<typeof createOpenAI> | null = null;

  constructor(apiKey?: string) {
    super(AIProvider.OpenAI);
    this.apiKey = apiKey || env.OPENAI_API_KEY;

    if (this.apiKey) {
      this.client = createOpenAI({
        apiKey: this.apiKey,
      });
    }
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  getDefaultModel(): string {
    return env.AI_DEFAULT_CHAT_MODEL || "gpt-4o-mini";
  }

  getModel(modelId: string) {
    if (!this.client) {
      throw new Error("OpenAI provider is not configured");
    }
    return this.client(modelId);
  }

  async listModels(): Promise<AIModelInfo[]> {
    return OPENAI_MODELS;
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
      throw new Error("OpenAI provider is not configured");
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
      throw new Error("OpenAI provider is not configured");
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

export default OpenAIProvider;
