import { observer } from "mobx-react";
import { OpenIcon } from "outline-icons";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { useHistory, useRouteMatch } from "react-router-dom";
import styled from "styled-components";
import { s } from "@shared/styles";
import Flex from "~/components/Flex";
import Button from "~/components/Button";
import Tooltip from "~/components/Tooltip";
import useKeyDown from "~/hooks/useKeyDown";
import useStores from "~/hooks/useStores";
import { chatPath } from "~/utils/routeHelpers";
import ChatPanel from "./ChatPanel";
import SidebarLayout from "~/scenes/Document/components/SidebarLayout";

function ChatSidebar() {
  const { t } = useTranslation();
  const { ui, documents, aiConversations } = useStores();
  const history = useHistory();
  const match = useRouteMatch<{ documentSlug: string }>();
  const document = match?.params?.documentSlug
    ? documents.get(match.params.documentSlug)
    : undefined;

  useKeyDown("Escape", () => ui.set({ chatSidebarExpanded: false }));

  // Get or create a document-specific conversation
  const documentConversations = document
    ? aiConversations.orderedData.filter((c) => c.documentId === document.id)
    : [];
  const activeConversation = documentConversations[0];

  const handleExpandToFullPage = () => {
    ui.set({ chatSidebarExpanded: false });
    if (activeConversation) {
      history.push(chatPath(activeConversation.id));
    } else {
      history.push(chatPath());
    }
  };

  const titleContent = (
    <TitleWrapper align="center" justify="space-between" gap={8} auto>
      <TitleText>{t("AI Chat")}</TitleText>
      <Tooltip content={t("Open full chat page")}>
        <ExpandButton
          icon={<OpenIcon />}
          onClick={handleExpandToFullPage}
          borderOnHover
          neutral
        />
      </Tooltip>
    </TitleWrapper>
  );

  return (
    <SidebarLayout
      title={titleContent}
      onClose={() => ui.set({ chatSidebarExpanded: false })}
      scrollable={false}
    >
      <ChatContainer>
        {document && (
          <DocumentContext>
            <DocumentLabel>{t("Context")}:</DocumentLabel>
            <DocumentTitle>{document.titleWithDefault}</DocumentTitle>
          </DocumentContext>
        )}
        <ChatPanel
          conversation={activeConversation}
          documentId={document?.id}
        />
      </ChatContainer>
    </SidebarLayout>
  );
}

const TitleWrapper = styled(Flex)`
  width: 100%;
`;

const TitleText = styled.span`
  font-size: 16px;
  font-weight: 600;
`;

const ExpandButton = styled(Button)`
  width: 28px;
  height: 28px;
  padding: 0;
`;

const ChatContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
`;

const DocumentContext = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: ${s("secondaryBackground")};
  border-bottom: 1px solid ${s("divider")};
  font-size: 13px;
  flex-shrink: 0;
`;

const DocumentLabel = styled.span`
  color: ${s("textTertiary")};
`;

const DocumentTitle = styled.span`
  color: ${s("text")};
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

export default observer(ChatSidebar);
