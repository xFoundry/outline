import * as React from "react";
import styled, { keyframes } from "styled-components";
import { s } from "@shared/styles";

type Props = {
  content: string;
  isStreaming?: boolean;
};

function ChatMessageContent({ content, isStreaming }: Props) {
  // Simple markdown-like rendering
  const renderContent = () => {
    if (!content) {
      return isStreaming ? <StreamingCursor /> : null;
    }

    // Split by code blocks first
    const parts = content.split(/(```[\s\S]*?```)/g);

    return parts.map((part, index) => {
      if (part.startsWith("```") && part.endsWith("```")) {
        // Code block
        const codeContent = part.slice(3, -3);
        const lines = codeContent.split("\n");
        const language = lines[0]?.trim() || "";
        const code = lines.slice(1).join("\n") || codeContent;

        return (
          <CodeBlock key={index}>
            {language && <CodeLanguage>{language}</CodeLanguage>}
            <Code>{code.trim()}</Code>
          </CodeBlock>
        );
      }

      // Regular text - handle inline formatting
      return (
        <TextBlock key={index}>
          {renderInlineContent(part)}
        </TextBlock>
      );
    });
  };

  const renderInlineContent = (text: string) => {
    // Handle inline code
    const parts = text.split(/(`[^`]+`)/g);

    return parts.map((part, index) => {
      if (part.startsWith("`") && part.endsWith("`")) {
        return <InlineCode key={index}>{part.slice(1, -1)}</InlineCode>;
      }

      // Handle bold
      const boldParts = part.split(/(\*\*[^*]+\*\*)/g);
      return boldParts.map((boldPart, boldIndex) => {
        if (boldPart.startsWith("**") && boldPart.endsWith("**")) {
          return <strong key={`${index}-${boldIndex}`}>{boldPart.slice(2, -2)}</strong>;
        }
        return <span key={`${index}-${boldIndex}`}>{boldPart}</span>;
      });
    });
  };

  return (
    <ContentWrapper>
      {renderContent()}
      {isStreaming && content && <StreamingCursor />}
    </ContentWrapper>
  );
}

const blink = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
`;

const ContentWrapper = styled.div`
  font-size: 14px;
  line-height: 1.6;
  color: ${s("text")};
  word-wrap: break-word;
  white-space: pre-wrap;
`;

const TextBlock = styled.p`
  margin: 0 0 8px 0;

  &:last-child {
    margin-bottom: 0;
  }
`;

const CodeBlock = styled.div`
  background: ${s("codeBackground")};
  border-radius: 6px;
  margin: 8px 0;
  overflow: hidden;
`;

const CodeLanguage = styled.div`
  padding: 4px 12px;
  font-size: 12px;
  color: ${s("textTertiary")};
  border-bottom: 1px solid ${s("divider")};
`;

const Code = styled.pre`
  padding: 12px;
  margin: 0;
  overflow-x: auto;
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
  font-size: 13px;
  line-height: 1.5;
  color: ${s("text")};
`;

const InlineCode = styled.code`
  background: ${s("codeBackground")};
  padding: 2px 6px;
  border-radius: 4px;
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
  font-size: 13px;
`;

const StreamingCursor = styled.span`
  display: inline-block;
  width: 8px;
  height: 16px;
  background: ${s("accent")};
  margin-left: 2px;
  vertical-align: text-bottom;
  animation: ${blink} 1s infinite;
`;

export default ChatMessageContent;
