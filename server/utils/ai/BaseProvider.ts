import { CoreMessage, LanguageModelV1 } from "ai";
import { AIProvider, AIOperationType } from "@shared/types";

export type AIStreamCallbacks = {
  onStart?: () => void;
  onToken?: (token: string) => void;
  onText?: (text: string) => void;
  onToolCall?: (toolCall: { id: string; name: string; arguments: unknown }) => void;
  onToolResult?: (result: { id: string; result: unknown }) => void;
  onFinish?: (result: { text: string; usage: { promptTokens: number; completionTokens: number } }) => void;
  onError?: (error: Error) => void;
};

export type AITool = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (args: unknown) => Promise<unknown>;
};

export type AIModelConfig = {
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  topK?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stopSequences?: string[];
};

export type AIChatOptions = {
  messages: CoreMessage[];
  model: string;
  systemPrompt?: string;
  tools?: AITool[];
  config?: AIModelConfig;
  signal?: AbortSignal;
};

export type AIEditOptions = {
  content: string;
  instruction: string;
  operation: AIOperationType;
  model: string;
  config?: AIModelConfig;
  signal?: AbortSignal;
};

export type AIStreamResult = {
  textStream: AsyncIterable<string>;
  usage: Promise<{ promptTokens: number; completionTokens: number }>;
};

export type AIModelInfo = {
  id: string;
  name: string;
  provider: AIProvider;
  contextLength: number;
  supportsTools?: boolean;
  supportsStreaming?: boolean;
  pricing?: {
    inputPerMillion: number;
    outputPerMillion: number;
  };
};

/**
 * Abstract base class for AI providers.
 * Implementations should extend this class and provide concrete implementations
 * for the abstract methods.
 */
export abstract class BaseProvider {
  readonly provider: AIProvider;

  constructor(provider: AIProvider) {
    this.provider = provider;
  }

  /**
   * Get the underlying language model for a given model ID.
   */
  abstract getModel(modelId: string): LanguageModelV1;

  /**
   * Stream a chat completion.
   */
  abstract streamChat(
    options: AIChatOptions,
    callbacks: AIStreamCallbacks
  ): Promise<AIStreamResult>;

  /**
   * Stream an edit/generation completion.
   */
  abstract streamEdit(
    options: AIEditOptions,
    callbacks: AIStreamCallbacks
  ): Promise<AIStreamResult>;

  /**
   * List available models.
   */
  abstract listModels(): Promise<AIModelInfo[]>;

  /**
   * Check if the provider is properly configured.
   */
  abstract isConfigured(): boolean;

  /**
   * Get the default model ID for this provider.
   */
  abstract getDefaultModel(): string;
}

export default BaseProvider;
