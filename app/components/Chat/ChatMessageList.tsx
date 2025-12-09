import { observer } from "mobx-react";
import * as React from "react";
import styled from "styled-components";
import { s } from "@shared/styles";
import { AIMessageData } from "@shared/types";
import ChatMessage from "./ChatMessage";

type Props = {
  messages: AIMessageData[];
  isStreaming?: boolean;
  streamedContent?: string;
};

function ChatMessageList({ messages, isStreaming, streamedContent }: Props) {
  const listRef = React.useRef<HTMLDivElement>(null);

  // Scroll to bottom when messages change or when streaming
  React.useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, streamedContent]);

  return (
    <Container ref={listRef}>
      {messages.length === 0 ? (
        <EmptyState>
          <EmptyIcon>AI</EmptyIcon>
          <EmptyTitle>Start a conversation</EmptyTitle>
          <EmptyDescription>
            Ask questions, get help with writing, or explore your documents.
          </EmptyDescription>
        </EmptyState>
      ) : (
        <>
          {messages.map((message, index) => (
            <ChatMessage
              key={`${message.createdAt}-${index}`}
              message={message}
            />
          ))}
          {isStreaming && streamedContent !== undefined && (
            <ChatMessage
              message={{
                role: "assistant",
                content: streamedContent,
                createdAt: new Date().toISOString(),
              }}
              isStreaming={true}
              streamedContent={streamedContent}
            />
          )}
        </>
      )}
    </Container>
  );
}

const Container = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 16px;
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
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: ${s("accent")};
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  font-weight: 600;
  margin-bottom: 16px;
`;

const EmptyTitle = styled.h3`
  margin: 0 0 8px 0;
  font-size: 18px;
  font-weight: 600;
  color: ${s("text")};
`;

const EmptyDescription = styled.p`
  margin: 0;
  font-size: 14px;
  color: ${s("textSecondary")};
  max-width: 300px;
`;

export default observer(ChatMessageList);
