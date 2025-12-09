import { observer } from "mobx-react";
import * as React from "react";
import styled from "styled-components";
import { s } from "@shared/styles";
import AIConversation from "~/models/AIConversation";
import useStores from "~/hooks/useStores";
import ChatInput from "./ChatInput";
import ChatMessageList from "./ChatMessageList";

type Props = {
  conversation?: AIConversation;
  documentId?: string;
  onNewConversation?: () => void;
};

function ChatPanel({ conversation, documentId, onNewConversation }: Props) {
  const { aiConversations } = useStores();

  const handleSendMessage = async (message: string) => {
    await aiConversations.sendChatMessage({
      message,
      conversationId: conversation?.id,
      documentId,
      onToken: (token) => {
        // Token callback - can be used for additional UI updates
      },
      onFinish: (text) => {
        // Finished streaming
      },
      onError: (error) => {
        console.error("Chat error:", error);
      },
    });
  };

  const handleCancel = () => {
    aiConversations.cancelStream();
  };

  const messages = conversation?.messages || [];
  const isStreaming = conversation?.isStreaming || aiConversations.isStreamingChat;
  const streamedContent = conversation?.streamedContent || aiConversations.currentStreamedContent;

  return (
    <Container>
      <ChatMessageList
        messages={messages}
        isStreaming={isStreaming}
        streamedContent={streamedContent}
      />
      <ChatInput
        onSend={handleSendMessage}
        onCancel={handleCancel}
        isStreaming={isStreaming}
      />
    </Container>
  );
}

const Container = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  background: ${s("background")};
`;

export default observer(ChatPanel);
