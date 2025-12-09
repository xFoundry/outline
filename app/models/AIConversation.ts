import { observable, computed, action } from "mobx";
import {
  AIConversationType,
  AIMessageData,
  AIConversationMetadata,
  AIMessageRole,
} from "@shared/types";
import Model from "./base/Model";
import Field from "./decorators/Field";

class AIConversation extends Model {
  static modelName = "AIConversation";

  @Field
  @observable
  title: string | null;

  @Field
  @observable
  type: AIConversationType;

  @Field
  @observable
  documentId: string | null;

  @Field
  @observable
  messages: AIMessageData[];

  @Field
  @observable
  metadata: AIConversationMetadata | null;

  @observable
  lastMessageAt: string | null;

  /**
   * Whether the conversation is currently streaming a response.
   */
  @observable
  isStreaming: boolean = false;

  /**
   * The current streamed content being built up.
   */
  @observable
  streamedContent: string = "";

  /**
   * Get the display title for this conversation.
   */
  @computed
  get displayTitle(): string {
    if (this.title) {
      return this.title;
    }

    const firstUserMessage = this.messages.find(
      (m) => m.role === AIMessageRole.User
    );
    if (firstUserMessage) {
      const content = firstUserMessage.content.trim();
      return content.length > 50 ? `${content.substring(0, 47)}...` : content;
    }

    return "New conversation";
  }

  /**
   * Get the total message count.
   */
  @computed
  get messageCount(): number {
    return this.messages.length;
  }

  /**
   * Get the last message in the conversation.
   */
  @computed
  get lastMessage(): AIMessageData | undefined {
    return this.messages[this.messages.length - 1];
  }

  /**
   * Get total tokens used in this conversation.
   */
  @computed
  get totalTokens(): number {
    return this.metadata?.totalTokens ?? 0;
  }

  /**
   * Add a message to the conversation (optimistic update).
   */
  @action
  addMessage(message: AIMessageData): void {
    this.messages = [...this.messages, message];
    this.lastMessageAt = new Date().toISOString();
  }

  /**
   * Start streaming mode.
   */
  @action
  startStreaming(): void {
    this.isStreaming = true;
    this.streamedContent = "";
  }

  /**
   * Append to streamed content.
   */
  @action
  appendStreamedContent(token: string): void {
    this.streamedContent += token;
  }

  /**
   * Finish streaming and add the response as a message.
   */
  @action
  finishStreaming(): void {
    if (this.streamedContent) {
      this.addMessage({
        role: AIMessageRole.Assistant,
        content: this.streamedContent,
        createdAt: new Date().toISOString(),
      });
    }
    this.isStreaming = false;
    this.streamedContent = "";
  }

  /**
   * Cancel streaming.
   */
  @action
  cancelStreaming(): void {
    this.isStreaming = false;
    this.streamedContent = "";
  }
}

export default AIConversation;
