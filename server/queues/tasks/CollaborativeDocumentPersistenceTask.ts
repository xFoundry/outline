import documentCollaborativeUpdater from "@server/commands/documentCollaborativeUpdater";
import {
  type CollaborativePersistenceRetryPayload,
  decodeCollaborativeDocument,
  getCollaborativePersistenceKey,
} from "@server/collaboration/documentPersistence";
import Logger from "@server/logging/Logger";
import Redis from "@server/storage/redis";
import { BaseTask, TaskPriority } from "./base/BaseTask";

type Props = {
  documentId: string;
};

export default class CollaborativeDocumentPersistenceTask extends BaseTask<Props> {
  public async perform({ documentId }: Props) {
    const key = getCollaborativePersistenceKey(documentId);
    const payload = await Redis.defaultClient.get(key);

    if (!payload) {
      return;
    }

    const data = JSON.parse(payload) as CollaborativePersistenceRetryPayload;
    const ydoc = decodeCollaborativeDocument(data.ydocState);

    try {
      await documentCollaborativeUpdater({
        documentId: data.documentId,
        ydoc,
        sessionCollaboratorIds: data.sessionCollaboratorIds,
        isLastConnection: data.isLastConnection,
        clientVersion: data.clientVersion,
        retryCount: data.retryCount,
      });

      await Redis.defaultClient.del(key);
    } finally {
      ydoc.destroy();
    }
  }

  public async onFailed({ documentId }: Props) {
    Logger.warn("Collaborative persistence retry exhausted", {
      documentId,
    });
  }

  public get options() {
    return {
      attempts: 1,
      priority: TaskPriority.High,
    };
  }
}
