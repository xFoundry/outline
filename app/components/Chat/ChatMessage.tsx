import { observer } from "mobx-react";
import * as React from "react";
import styled from "styled-components";
import { s } from "@shared/styles";
import { AIMessageRole, AIMessageData } from "@shared/types";
import { Avatar } from "~/components/Avatar";
import Flex from "~/components/Flex";
import useStores from "~/hooks/useStores";
import ChatMessageContent from "./ChatMessageContent";

type Props = {
  message: AIMessageData;
  isStreaming?: boolean;
  streamedContent?: string;
};

function ChatMessage({ message, isStreaming, streamedContent }: Props) {
  const { auth } = useStores();
  const isUser = message.role === AIMessageRole.User;
  const user = auth.user;

  const content = isStreaming ? streamedContent || "" : message.content;

  return (
    <MessageContainer $isUser={isUser}>
      <AvatarWrapper>
        {isUser && user ? (
          <Avatar model={user} size={28} />
        ) : (
          <AIAvatar>AI</AIAvatar>
        )}
      </AvatarWrapper>
      <MessageContent>
        <MessageHeader>
          <SenderName>{isUser ? user?.name || "You" : "Assistant"}</SenderName>
          {!isStreaming && message.createdAt && (
            <Timestamp>
              {new Date(message.createdAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </Timestamp>
          )}
        </MessageHeader>
        <ChatMessageContent content={content} isStreaming={isStreaming} />
      </MessageContent>
    </MessageContainer>
  );
}

const MessageContainer = styled(Flex)<{ $isUser: boolean }>`
  padding: 12px 16px;
  gap: 12px;
  background: ${(props) => (props.$isUser ? "transparent" : s("secondaryBackground"))};
  border-radius: 8px;
  margin-bottom: 8px;
`;

const AvatarWrapper = styled.div`
  flex-shrink: 0;
`;

const AIAvatar = styled.div`
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: ${s("accent")};
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 600;
`;

const MessageContent = styled.div`
  flex: 1;
  min-width: 0;
`;

const MessageHeader = styled(Flex)`
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
`;

const SenderName = styled.span`
  font-weight: 600;
  font-size: 14px;
  color: ${s("text")};
`;

const Timestamp = styled.span`
  font-size: 12px;
  color: ${s("textTertiary")};
`;

export default observer(ChatMessage);
