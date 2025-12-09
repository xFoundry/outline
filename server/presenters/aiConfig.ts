import { AIConfig, AIProvidersConfig } from "@server/models/AIConfig";
import { AIProvider } from "@shared/types";

type Options = {
  /** Whether to include sensitive data like API key status */
  includeSensitive?: boolean;
};

/**
 * Masks an API key to show only partial information for security.
 */
function maskApiKey(key: string | undefined): string | null {
  if (!key) {
    return null;
  }
  if (key.length <= 8) {
    return "****";
  }
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

export default function present(
  config: AIConfig,
  { includeSensitive = false }: Options = {}
) {
  const providers = config.getProvidersConfig();

  // Create a safe view of providers (without actual API keys)
  const safeProviders: Record<AIProvider, { enabled: boolean; hasApiKey: boolean; maskedKey?: string | null }> = {
    [AIProvider.OpenRouter]: {
      enabled: providers[AIProvider.OpenRouter]?.enabled ?? false,
      hasApiKey: !!providers[AIProvider.OpenRouter]?.apiKey,
      ...(includeSensitive && {
        maskedKey: maskApiKey(providers[AIProvider.OpenRouter]?.apiKey),
      }),
    },
    [AIProvider.OpenAI]: {
      enabled: providers[AIProvider.OpenAI]?.enabled ?? false,
      hasApiKey: !!providers[AIProvider.OpenAI]?.apiKey,
      ...(includeSensitive && {
        maskedKey: maskApiKey(providers[AIProvider.OpenAI]?.apiKey),
      }),
    },
  };

  return {
    id: config.id,
    teamId: config.teamId,
    enabled: config.enabled,
    providers: safeProviders,
    defaultModels: config.defaultModels,
    availableModels: config.availableModels,
    permissions: config.permissions,
    rateLimits: config.rateLimits,
    createdAt: config.createdAt,
    updatedAt: config.updatedAt,
  };
}
