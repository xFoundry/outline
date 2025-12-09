import {
  InferAttributes,
  InferCreationAttributes,
} from "sequelize";
import {
  ForeignKey,
  BelongsTo,
  Column,
  Table,
  DataType,
  Default,
  Unique,
} from "sequelize-typescript";
import {
  AIProvider,
  AIFeature,
  AIPermissions,
  AIRateLimits,
  AIProviderConfig,
} from "@shared/types";
import Team from "@server/models/Team";
import ParanoidModel from "@server/models/base/ParanoidModel";
import Encrypted from "@server/models/decorators/Encrypted";
import Fix from "@server/models/decorators/Fix";

export type AIProvidersConfig = {
  [AIProvider.OpenRouter]?: AIProviderConfig;
  [AIProvider.OpenAI]?: AIProviderConfig;
};

export type AIDefaultModels = {
  chat?: string;
  edit?: string;
};

export type AIAvailableModels = {
  [AIProvider.OpenRouter]?: string[];
  [AIProvider.OpenAI]?: string[];
};

@Table({ tableName: "ai_configs", modelName: "ai_config" })
@Fix
class AIConfig extends ParanoidModel<
  InferAttributes<AIConfig>,
  Partial<InferCreationAttributes<AIConfig>>
> {
  @Default(false)
  @Column(DataType.BOOLEAN)
  enabled: boolean;

  /**
   * Encrypted JSON containing provider API keys.
   * Stored as BLOB for security, decrypted on access.
   */
  @Column(DataType.BLOB)
  @Encrypted
  providers: string | null;

  @Column(DataType.JSONB)
  defaultModels: AIDefaultModels | null;

  @Column(DataType.JSONB)
  availableModels: AIAvailableModels | null;

  @Default({
    enabledFor: "admins",
    features: {
      [AIFeature.Chat]: true,
      [AIFeature.Editing]: true,
      [AIFeature.Generation]: true,
    },
  })
  @Column(DataType.JSONB)
  permissions: AIPermissions;

  @Default({
    requestsPerMinute: 20,
    tokensPerDay: 100000,
    tokensPerMonth: 2000000,
  })
  @Column(DataType.JSONB)
  rateLimits: AIRateLimits;

  // associations

  @BelongsTo(() => Team, "teamId")
  team: Team;

  @Unique
  @ForeignKey(() => Team)
  @Column(DataType.UUID)
  teamId: string;

  // methods

  /**
   * Get the parsed providers configuration.
   * Returns an empty object if providers is null or empty.
   */
  getProvidersConfig(): AIProvidersConfig {
    if (!this.providers) {
      return {};
    }
    try {
      return JSON.parse(this.providers) as AIProvidersConfig;
    } catch {
      return {};
    }
  }

  /**
   * Set the providers configuration.
   * Encrypts the JSON string before storing.
   */
  setProvidersConfig(config: AIProvidersConfig): void {
    this.providers = JSON.stringify(config);
  }

  /**
   * Get the API key for a specific provider.
   */
  getProviderApiKey(provider: AIProvider): string | undefined {
    const config = this.getProvidersConfig();
    return config[provider]?.apiKey;
  }

  /**
   * Check if a specific provider is enabled.
   */
  isProviderEnabled(provider: AIProvider): boolean {
    const config = this.getProvidersConfig();
    return config[provider]?.enabled ?? false;
  }

  /**
   * Check if a specific feature is enabled.
   */
  isFeatureEnabled(feature: AIFeature): boolean {
    return this.enabled && (this.permissions.features[feature] ?? false);
  }

  /**
   * Get the default model for a given type.
   */
  getDefaultModel(type: "chat" | "edit"): string | undefined {
    return this.defaultModels?.[type];
  }

  /**
   * Check if a model is available for use.
   */
  isModelAvailable(provider: AIProvider, model: string): boolean {
    const available = this.availableModels?.[provider];
    // If no whitelist is set, all models are available
    if (!available || available.length === 0) {
      return true;
    }
    return available.includes(model);
  }
}

export default AIConfig;
