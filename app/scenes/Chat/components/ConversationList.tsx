import { observer } from "mobx-react";
import { PlusIcon, TrashIcon } from "outline-icons";
import * as React from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { s } from "@shared/styles";
import AIConversation from "~/models/AIConversation";
import Button from "~/components/Button";
import Flex from "~/components/Flex";
import useStores from "~/hooks/useStores";
import Time from "~/components/Time";

type Props = {
  onSelectConversation: (conversationId: string | null) => void;
  selectedConversationId: string | null;
};

function ConversationList({ onSelectConversation, selectedConversationId }: Props) {
  const { t } = useTranslation();
  const { aiConversations } = useStores();
  const conversations = aiConversations.orderedData;

  React.useEffect(() => {
    aiConversations.fetchConversations();
  }, [aiConversations]);

  const handleNewConversation = () => {
    onSelectConversation(null);
  };

  const handleDeleteConversation = async (
    e: React.MouseEvent,
    conversationId: string
  ) => {
    e.stopPropagation();
    await aiConversations.deleteConversation(conversationId);

    if (selectedConversationId === conversationId) {
      onSelectConversation(null);
    }
  };

  return (
    <Container>
      <Header>
        <HeaderTitle>{t("Conversations")}</HeaderTitle>
        <NewButton onClick={handleNewConversation} neutral borderOnHover>
          <PlusIcon />
        </NewButton>
      </Header>

      <List>
        {conversations.length === 0 ? (
          <EmptyState>{t("No conversations yet")}</EmptyState>
        ) : (
          conversations.map((conversation) => (
            <ConversationItem
              key={conversation.id}
              $isSelected={conversation.id === selectedConversationId}
              onClick={() => onSelectConversation(conversation.id)}
            >
              <ConversationContent>
                <ConversationTitle>{conversation.displayTitle}</ConversationTitle>
                {conversation.lastMessageAt && (
                  <ConversationMeta>
                    <Time dateTime={conversation.lastMessageAt} />
                  </ConversationMeta>
                )}
              </ConversationContent>
              <DeleteButton
                onClick={(e) => handleDeleteConversation(e, conversation.id)}
                neutral
                borderOnHover
              >
                <TrashIcon />
              </DeleteButton>
            </ConversationItem>
          ))
        )}
      </List>
    </Container>
  );
}

const Container = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  background: ${s("sidebarBackground")};
  border-right: 1px solid ${s("divider")};
`;

const Header = styled(Flex)`
  padding: 12px 16px;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid ${s("divider")};
`;

const HeaderTitle = styled.h3`
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: ${s("text")};
`;

const NewButton = styled(Button)`
  width: 28px;
  height: 28px;
  padding: 0;
`;

const List = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 8px;
`;

const EmptyState = styled.div`
  padding: 24px;
  text-align: center;
  color: ${s("textSecondary")};
  font-size: 14px;
`;

const ConversationItem = styled.div<{ $isSelected: boolean }>`
  display: flex;
  align-items: center;
  padding: 10px 12px;
  border-radius: 6px;
  cursor: pointer;
  gap: 8px;
  background: ${(props) => (props.$isSelected ? s("sidebarActiveBackground") : "transparent")};

  &:hover {
    background: ${(props) =>
      props.$isSelected ? s("sidebarActiveBackground") : s("listItemHoverBackground")};
  }
`;

const ConversationContent = styled.div`
  flex: 1;
  min-width: 0;
`;

const ConversationTitle = styled.div`
  font-size: 14px;
  font-weight: 500;
  color: ${s("text")};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const ConversationMeta = styled.div`
  font-size: 12px;
  color: ${s("textTertiary")};
  margin-top: 2px;
`;

const DeleteButton = styled(Button)`
  width: 24px;
  height: 24px;
  padding: 0;
  opacity: 0;
  transition: opacity 100ms;

  ${ConversationItem}:hover & {
    opacity: 0.7;
  }

  &:hover {
    opacity: 1 !important;
  }
`;

export default observer(ConversationList);
