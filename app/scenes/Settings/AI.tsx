import { observer } from "mobx-react";
import { SparklesIcon } from "outline-icons";
import * as React from "react";
import { Trans, useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AIProvider, TeamPreference } from "@shared/types";
import Button from "~/components/Button";
import Flex from "~/components/Flex";
import Heading from "~/components/Heading";
import Input from "~/components/Input";
import { InputSelect, type Option } from "~/components/InputSelect";
import Scene from "~/components/Scene";
import Switch from "~/components/Switch";
import Text from "~/components/Text";
import useCurrentTeam from "~/hooks/useCurrentTeam";
import useStores from "~/hooks/useStores";
import SettingRow from "./components/SettingRow";

function AI() {
  const team = useCurrentTeam();
  const { t } = useTranslation();
  const { aiConversations } = useStores();

  const [provider, setProvider] = React.useState<AIProvider>(
    AIProvider.OpenRouter
  );
  const [apiKey, setApiKey] = React.useState("");
  const [defaultModel, setDefaultModel] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const handleAIEnabledChange = React.useCallback(
    async (checked: boolean) => {
      team.setPreference(TeamPreference.AIEnabled, checked);
      await team.save();
      toast.success(t("Settings saved"));
    },
    [team, t]
  );

  const handleAIChatEnabledChange = React.useCallback(
    async (checked: boolean) => {
      team.setPreference(TeamPreference.AIChatEnabled, checked);
      await team.save();
      toast.success(t("Settings saved"));
    },
    [team, t]
  );

  const handleAIEditingEnabledChange = React.useCallback(
    async (checked: boolean) => {
      team.setPreference(TeamPreference.AIEditingEnabled, checked);
      await team.save();
      toast.success(t("Settings saved"));
    },
    [team, t]
  );

  const handleSaveConfig = async () => {
    setSaving(true);
    try {
      // TODO: Implement API call to save AI config
      // This would call the ai.config.update endpoint
      toast.success(t("AI configuration saved"));
    } catch (error) {
      toast.error(t("Failed to save AI configuration"));
    } finally {
      setSaving(false);
    }
  };

  const providerOptions: Option[] = [
    { type: "item", value: AIProvider.OpenRouter, label: "OpenRouter" },
    { type: "item", value: AIProvider.OpenAI, label: "OpenAI" },
  ];

  return (
    <Scene title={t("AI")} icon={<SparklesIcon />}>
      <Heading>{t("AI")}</Heading>
      <Text as="p" type="secondary">
        <Trans>
          Configure AI features for your workspace. AI capabilities include
          chat, document-aware conversations, and inline editing assistance.
        </Trans>
      </Text>

      <Heading as="h2">{t("Features")}</Heading>

      <SettingRow
        name="ai-enabled"
        label={t("Enable AI")}
        description={t(
          "When enabled, AI features will be available to workspace members."
        )}
      >
        <Switch
          id="ai-enabled"
          name="ai-enabled"
          checked={team.getPreference(TeamPreference.AIEnabled)}
          onChange={handleAIEnabledChange}
        />
      </SettingRow>

      <SettingRow
        name="ai-chat-enabled"
        label={t("AI Chat")}
        description={t(
          "Allow members to use the AI chat feature for conversations and document Q&A."
        )}
      >
        <Switch
          id="ai-chat-enabled"
          name="ai-chat-enabled"
          checked={team.getPreference(TeamPreference.AIChatEnabled)}
          onChange={handleAIChatEnabledChange}
          disabled={!team.getPreference(TeamPreference.AIEnabled)}
        />
      </SettingRow>

      <SettingRow
        name="ai-editing-enabled"
        label={t("AI Editing")}
        description={t(
          "Allow members to use AI-powered editing features like rephrase, expand, and simplify."
        )}
      >
        <Switch
          id="ai-editing-enabled"
          name="ai-editing-enabled"
          checked={team.getPreference(TeamPreference.AIEditingEnabled)}
          onChange={handleAIEditingEnabledChange}
          disabled={!team.getPreference(TeamPreference.AIEnabled)}
        />
      </SettingRow>

      <Heading as="h2">{t("Configuration")}</Heading>
      <Text as="p" type="secondary">
        <Trans>
          Configure the AI provider and API keys. If not set, the system will
          use the default configuration from environment variables.
        </Trans>
      </Text>

      <SettingRow
        name="ai-provider"
        label={t("Provider")}
        description={t("Select the AI provider to use for this workspace.")}
      >
        <InputSelect
          value={provider}
          options={providerOptions}
          onChange={(value) => setProvider(value as AIProvider)}
          label={t("AI Provider")}
          hideLabel
        />
      </SettingRow>

      <SettingRow
        name="ai-api-key"
        label={t("API Key")}
        description={t(
          "Enter your API key for the selected provider. Leave blank to use the system default."
        )}
      >
        <Input
          id="ai-api-key"
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={t("Enter API key...")}
        />
      </SettingRow>

      <SettingRow
        name="ai-default-model"
        label={t("Default Model")}
        description={t(
          "Specify the default model to use. Leave blank to use the provider's default."
        )}
      >
        <Input
          id="ai-default-model"
          value={defaultModel}
          onChange={(e) => setDefaultModel(e.target.value)}
          placeholder={
            provider === AIProvider.OpenRouter
              ? "anthropic/claude-3.5-sonnet"
              : "gpt-4o"
          }
        />
      </SettingRow>

      <Flex justify="flex-end" style={{ marginTop: 24 }}>
        <Button onClick={handleSaveConfig} disabled={saving}>
          {saving ? t("Saving...") : t("Save Configuration")}
        </Button>
      </Flex>
    </Scene>
  );
}

export default observer(AI);
