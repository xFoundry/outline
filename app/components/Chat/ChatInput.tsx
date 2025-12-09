import { observer } from "mobx-react";
import { PlaneIcon, CloseIcon } from "outline-icons";
import * as React from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { s } from "@shared/styles";
import Button from "~/components/Button";
import Flex from "~/components/Flex";

type Props = {
  onSend: (message: string) => void;
  onCancel?: () => void;
  isStreaming?: boolean;
  disabled?: boolean;
  placeholder?: string;
};

function ChatInput({
  onSend,
  onCancel,
  isStreaming,
  disabled,
  placeholder,
}: Props) {
  const { t } = useTranslation();
  const [message, setMessage] = React.useState("");
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim() && !isStreaming && !disabled) {
      onSend(message.trim());
      setMessage("");
      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);
    // Auto-resize textarea
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  };

  const handleCancelClick = () => {
    onCancel?.();
  };

  return (
    <Form onSubmit={handleSubmit}>
      <InputContainer>
        <TextArea
          ref={textareaRef}
          value={message}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder || t("Type a message...")}
          disabled={disabled}
          rows={1}
        />
        <ButtonGroup>
          {isStreaming ? (
            <StopButton
              type="button"
              onClick={handleCancelClick}
              neutral
              borderOnHover
            >
              <CloseIcon />
            </StopButton>
          ) : (
            <SendButton
              type="submit"
              disabled={!message.trim() || disabled}
              neutral
              borderOnHover
            >
              <PlaneIcon />
            </SendButton>
          )}
        </ButtonGroup>
      </InputContainer>
      <HintText>
        {t("Press Enter to send, Shift+Enter for new line")}
      </HintText>
    </Form>
  );
}

const Form = styled.form`
  padding: 12px 16px;
  border-top: 1px solid ${s("divider")};
  background: ${s("background")};
`;

const InputContainer = styled(Flex)`
  background: ${s("secondaryBackground")};
  border: 1px solid ${s("inputBorder")};
  border-radius: 8px;
  padding: 8px 12px;
  align-items: flex-end;
  gap: 8px;

  &:focus-within {
    border-color: ${s("accent")};
    box-shadow: 0 0 0 1px ${s("accent")};
  }
`;

const TextArea = styled.textarea`
  flex: 1;
  border: none;
  background: transparent;
  color: ${s("text")};
  font-size: 14px;
  line-height: 1.5;
  resize: none;
  outline: none;
  min-height: 24px;
  max-height: 200px;
  padding: 0;

  &::placeholder {
    color: ${s("placeholder")};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const ButtonGroup = styled(Flex)`
  align-items: center;
  flex-shrink: 0;
`;

const SendButton = styled(Button)`
  width: 32px;
  height: 32px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;

  &:disabled {
    opacity: 0.3;
  }
`;

const StopButton = styled(Button)`
  width: 32px;
  height: 32px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${s("danger")};
`;

const HintText = styled.div`
  font-size: 11px;
  color: ${s("textTertiary")};
  margin-top: 6px;
  text-align: center;
`;

export default observer(ChatInput);
