import { observer } from "mobx-react";
import { SparklesIcon } from "outline-icons";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { useParams, useHistory } from "react-router-dom";
import styled from "styled-components";
import { s } from "@shared/styles";
import { ChatPanel } from "~/components/Chat";
import Flex from "~/components/Flex";
import Heading from "~/components/Heading";
import Scene from "~/components/Scene";
import useStores from "~/hooks/useStores";
import ConversationList from "./components/ConversationList";

function Chat() {
  const { t } = useTranslation();
  const { conversationId } = useParams<{ conversationId?: string }>();
  const history = useHistory();
  const { aiConversations } = useStores();

  const [selectedConversationId, setSelectedConversationId] = React.useState<string | null>(
    conversationId || null
  );

  // Sync URL param with selected conversation
  React.useEffect(() => {
    if (conversationId !== selectedConversationId) {
      setSelectedConversationId(conversationId || null);
    }
  }, [conversationId]);

  const handleSelectConversation = React.useCallback(
    (id: string | null) => {
      setSelectedConversationId(id);
      if (id) {
        history.replace(`/chat/${id}`);
      } else {
        history.replace("/chat");
      }
    },
    [history]
  );

  const conversation = selectedConversationId
    ? aiConversations.get(selectedConversationId)
    : undefined;

  return (
    <Scene title={t("Chat")}>
      <Container>
        <Sidebar>
          <ConversationList
            onSelectConversation={handleSelectConversation}
            selectedConversationId={selectedConversationId}
          />
        </Sidebar>
        <MainContent>
          {conversation ? (
            <ChatPanel
              conversation={conversation}
              onNewConversation={() => handleSelectConversation(null)}
            />
          ) : (
            <EmptyState>
              <EmptyIcon>
                <SparklesIcon size={48} />
              </EmptyIcon>
              <Heading as="h2">{t("AI Assistant")}</Heading>
              <EmptyDescription>
                {t("Start a new conversation or select an existing one from the sidebar.")}
              </EmptyDescription>
              <EmptyHint>
                {t("Ask questions, get help with writing, or explore your documents.")}
              </EmptyHint>
            </EmptyState>
          )}
        </MainContent>
      </Container>
    </Scene>
  );
}

const Container = styled(Flex)`
  height: 100%;
  overflow: hidden;
`;

const Sidebar = styled.div`
  width: 280px;
  min-width: 280px;
  height: 100%;
  flex-shrink: 0;

  @media (max-width: 768px) {
    display: none;
  }
`;

const MainContent = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  height: 100%;
`;

const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  text-align: center;
  padding: 24px;
`;

const EmptyIcon = styled.div`
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: ${s("accent")};
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 24px;
`;

const EmptyDescription = styled.p`
  font-size: 16px;
  color: ${s("textSecondary")};
  margin: 0 0 8px 0;
  max-width: 400px;
`;

const EmptyHint = styled.p`
  font-size: 14px;
  color: ${s("textTertiary")};
  margin: 0;
  max-width: 400px;
`;

export default observer(Chat);
