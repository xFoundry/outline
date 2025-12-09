import {
  InferAttributes,
  InferCreationAttributes,
} from "sequelize";
import {
  ForeignKey,
  BelongsTo,
  Column,
  Table,
  DataType,
  Default,
  Length,
  IsIn,
} from "sequelize-typescript";
import {
  AIConversationType,
  AIProvider,
  AIMessageData,
  AIConversationMetadata,
} from "@shared/types";
import Document from "@server/models/Document";
import Team from "@server/models/Team";
import User from "@server/models/User";
import IdModel from "@server/models/base/IdModel";
import Fix from "@server/models/decorators/Fix";

@Table({
  tableName: "ai_conversations",
  modelName: "ai_conversation",
  indexes: [
    { fields: ["userId", "teamId"] },
    { fields: ["documentId"] },
    { fields: ["teamId", "createdAt"] },
  ],
})
@Fix
class AIConversation extends IdModel<
  InferAttributes<AIConversation>,
  Partial<InferCreationAttributes<AIConversation>>
> {
  @Length({ max: 255 })
  @Column(DataType.STRING)
  title: string | null;

  @IsIn([Object.values(AIConversationType)])
  @Default(AIConversationType.Chat)
  @Column(DataType.STRING(50))
  type: AIConversationType;

  @Default([])
  @Column(DataType.JSONB)
  messages: AIMessageData[];

  @Column(DataType.JSONB)
  metadata: AIConversationMetadata | null;

  @Column(DataType.DATE)
  lastMessageAt: Date | null;

  // associations

  @BelongsTo(() => User, "userId")
  user: User;

  @ForeignKey(() => User)
  @Column(DataType.UUID)
  userId: string;

  @BelongsTo(() => Team, "teamId")
  team: Team;

  @ForeignKey(() => Team)
  @Column(DataType.UUID)
  teamId: string;

  @BelongsTo(() => Document, "documentId")
  document: Document | null;

  @ForeignKey(() => Document)
  @Column(DataType.UUID)
  documentId: string | null;

  // methods

  /**
   * Add a message to the conversation.
   */
  addMessage(message: AIMessageData): void {
    this.messages = [...this.messages, message];
    this.lastMessageAt = new Date();
  }

  /**
   * Get the total token count for this conversation.
   */
  getTotalTokens(): number {
    return this.metadata?.totalTokens ?? 0;
  }

  /**
   * Update the token count in metadata.
   */
  updateTokenCount(inputTokens: number, outputTokens: number): void {
    const currentTotal = this.getTotalTokens();
    this.metadata = {
      ...this.metadata,
      totalTokens: currentTotal + inputTokens + outputTokens,
    } as AIConversationMetadata;
  }

  /**
   * Get the provider used for this conversation.
   */
  getProvider(): AIProvider | undefined {
    return this.metadata?.provider;
  }

  /**
   * Get the model used for this conversation.
   */
  getModel(): string | undefined {
    return this.metadata?.model;
  }

  /**
   * Generate a title from the first user message if not set.
   */
  generateTitle(): string {
    if (this.title) {
      return this.title;
    }

    const firstUserMessage = this.messages.find((m) => m.role === "user");
    if (firstUserMessage) {
      // Truncate to first 50 characters
      const content = firstUserMessage.content.trim();
      return content.length > 50 ? `${content.substring(0, 47)}...` : content;
    }

    return "New conversation";
  }
}

export default AIConversation;
