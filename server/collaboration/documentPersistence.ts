import type { IncomingHttpHeaders } from "node:http";
import { ConnectionAcquireTimeoutError } from "sequelize";
import { Hour, Second } from "@shared/utils/time";
import * as Y from "yjs";

export type CollaborativePersistenceRetryPayload = {
  documentId: string;
  sessionCollaboratorIds: string[];
  isLastConnection: boolean;
  clientVersion: string | null;
  ydocState: string;
  retryCount: number;
};

export const COLLABORATIVE_PERSISTENCE_RETRY_DELAY = 5 * Second.ms;
export const COLLABORATIVE_PERSISTENCE_RETRY_TTL = Hour.seconds;

export function getCollaborativePersistenceJobId(documentId: string) {
  return `collaborative-persist:${documentId}`;
}

export function getCollaborativePersistenceKey(documentId: string) {
  return `collaboration:persist:${documentId}`;
}

export function encodeCollaborativeDocument(ydoc: Y.Doc) {
  return Buffer.from(Y.encodeStateAsUpdate(ydoc)).toString("base64");
}

export function decodeCollaborativeDocument(ydocState: string) {
  const ydoc = new Y.Doc();
  Y.applyUpdate(ydoc, Buffer.from(ydocState, "base64"));
  return ydoc;
}

export function getCollaborationRequestIp(
  requestHeaders: IncomingHttpHeaders
): string | undefined {
  const forwarded = requestHeaders["x-forwarded-for"];
  const forwardedValue = Array.isArray(forwarded)
    ? forwarded[0]
    : forwarded?.split(",")[0];

  if (forwardedValue?.trim()) {
    return forwardedValue.trim();
  }

  const realIp = requestHeaders["x-real-ip"];
  if (typeof realIp === "string" && realIp.trim()) {
    return realIp.trim();
  }

  const connectingIp = requestHeaders["cf-connecting-ip"];
  if (typeof connectingIp === "string" && connectingIp.trim()) {
    return connectingIp.trim();
  }

  return undefined;
}

function getPersistenceErrorMessage(error: unknown) {
  if (!error || typeof error !== "object") {
    return String(error);
  }

  const err = error as {
    message?: string;
    parent?: { message?: string };
    original?: { message?: string };
  };

  return [
    err.message,
    err.parent?.message,
    err.original?.message,
  ]
    .filter(Boolean)
    .join(" | ");
}

export function isCollaborativeLockTimeoutError(error: unknown) {
  return /lock timeout/i.test(getPersistenceErrorMessage(error));
}

export function isCollaborativeAcquireTimeoutError(error: unknown) {
  return (
    error instanceof ConnectionAcquireTimeoutError ||
    /SequelizeConnectionAcquireTimeoutError|ConnectionAcquireTimeoutError|Operation timeout/i.test(
      getPersistenceErrorMessage(error)
    )
  );
}

export function isRetryableCollaborativePersistenceError(error: unknown) {
  return (
    isCollaborativeLockTimeoutError(error) ||
    isCollaborativeAcquireTimeoutError(error)
  );
}

export function getCollaborativePersistenceErrorReason(error: unknown) {
  if (isCollaborativeLockTimeoutError(error)) {
    return "lock_timeout";
  }

  if (isCollaborativeAcquireTimeoutError(error)) {
    return "acquire_timeout";
  }

  return "unknown";
}
