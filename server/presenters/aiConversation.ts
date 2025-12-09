import { AIConversation } from "@server/models";

type Options = {
  /** Whether to include messages in the response */
  includeMessages?: boolean;
};

export default function present(
  conversation: AIConversation,
  { includeMessages = false }: Options = {}
) {
  return {
    id: conversation.id,
    title: conversation.title || conversation.generateTitle(),
    type: conversation.type,
    documentId: conversation.documentId,
    metadata: conversation.metadata,
    lastMessageAt: conversation.lastMessageAt,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    ...(includeMessages && { messages: conversation.messages }),
  };
}
