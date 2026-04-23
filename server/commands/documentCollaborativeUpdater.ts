import isEqual from "fast-deep-equal";
import uniq from "lodash/uniq";
import { yDocToProsemirrorJSON } from "y-prosemirror";
import * as Y from "yjs";
import type { ProsemirrorData } from "@shared/types";
import Logger from "@server/logging/Logger";
import Metrics from "@server/logging/Metrics";
import { Document, Event } from "@server/models";
import { sequelize } from "@server/storage/database";
import { AuthenticationType } from "@server/types";
import semver from "semver";
import {
  isCollaborativeAcquireTimeoutError,
  isCollaborativeLockTimeoutError,
} from "@server/collaboration/documentPersistence";

type Props = {
  /** The document ID to update. */
  documentId: string;
  /** Current collaobrative state. */
  ydoc: Y.Doc;
  /** The user IDs that have modified the document since it was last persisted. */
  sessionCollaboratorIds: string[];
  /** Whether the last connection to the document left. */
  isLastConnection: boolean;
  /** The client version, if available. */
  clientVersion: string | null;
  /** Retry count for observability. */
  retryCount?: number;
};

export default async function documentCollaborativeUpdater({
  documentId,
  ydoc,
  sessionCollaboratorIds,
  isLastConnection,
  clientVersion,
  retryCount = 0,
}: Props) {
  const startedAt = Date.now();
  const state = Buffer.from(Y.encodeStateAsUpdate(ydoc));
  const content = yDocToProsemirrorJSON(ydoc, "default") as ProsemirrorData;
  const pud = new Y.PermanentUserData(ydoc);
  const pudIds = Array.from(pud.clients.values());
  const sessionCollaborators = uniq([...sessionCollaboratorIds, ...pudIds]);

  try {
    return await sequelize.transaction(async (transaction) => {
      await sequelize.query(`SET LOCAL lock_timeout = '2s';`, {
        transaction,
      });

      const document = await Document.unscoped().findOne({
        attributes: [
          "id",
          "collectionId",
          "teamId",
          "title",
          "content",
          "state",
          "deletedAt",
          "lastModifiedById",
          "collaboratorIds",
          "editorVersion",
        ],
        where: {
          id: documentId,
        },
        transaction,
        lock: {
          of: Document,
          level: transaction.LOCK.UPDATE,
        },
        rejectOnEmpty: true,
        paranoid: false,
      });

      const stateUnchanged = document.state
        ? Buffer.compare(Buffer.from(document.state), state) === 0
        : false;
      const contentUnchanged = isEqual(document.content, content);

      if (stateUnchanged && contentUnchanged) {
        return;
      }

      const lastModifiedById = document.deletedAt
        ? document.lastModifiedById
        : (sessionCollaboratorIds[sessionCollaboratorIds.length - 1] ??
          document.lastModifiedById);
      const collaboratorIds = uniq([
        ...(document.collaboratorIds ?? []),
        ...sessionCollaborators,
      ]);
      const editorVersion =
        document.editorVersion && clientVersion
          ? semver.gt(clientVersion, document.editorVersion)
            ? clientVersion
            : document.editorVersion
          : clientVersion
            ? clientVersion
            : document.editorVersion;

      Logger.info(
        "multiplayer",
        `Persisting ${documentId}, attributed to ${lastModifiedById}`
      );

      await document.update(
        {
          content,
          state,
          lastModifiedById,
          collaboratorIds,
          editorVersion,
        },
        {
          transaction,
          // Hooks MUST NOT be called or the AfterUpdate hook in Document model may
          // result in infinite processing.
          hooks: false,
        }
      );

      await Event.schedule({
        name: "documents.update",
        documentId: document.id,
        collectionId: document.collectionId,
        teamId: document.teamId,
        actorId: lastModifiedById,
        authType: AuthenticationType.APP,
        data: {
          multiplayer: true,
          title: document.title,
          done: isLastConnection,
        },
      });
    });
  } catch (error) {
    if (isCollaborativeLockTimeoutError(error)) {
      Metrics.increment("collaboration.persist.lock_timeout");
    }

    if (isCollaborativeAcquireTimeoutError(error)) {
      Metrics.increment("collaboration.persist.acquire_timeout");
    }

    throw error;
  } finally {
    const duration = Date.now() - startedAt;
    Metrics.gauge("collaboration.persist.duration_ms", duration);

    if (retryCount > 0) {
      Metrics.increment("collaboration.persist.retry");
    }

    if (duration > 1000) {
      Logger.warn("Collaborative persistence exceeded threshold", {
        documentId,
        durationMs: duration,
        retryCount,
      });
    }
  }
}
