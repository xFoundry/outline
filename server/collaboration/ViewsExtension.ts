import type {
  Extension,
  onDisconnectPayload,
  onChangePayload,
} from "@hocuspocus/server";
import { Minute, Second } from "@shared/utils/time";
import Logger from "@server/logging/Logger";
import { trace } from "@server/logging/tracing";
import { User, View } from "@server/models";
import { getCollaborationRequestIp } from "./documentPersistence";
import type { withContext } from "./types";

type ViewActivity = {
  documentId: string;
  userId: string;
  lastSeenAt: number;
  lastFlushAt?: number;
};

type UserActivity = {
  ip?: string;
  lastSeenAt: number;
  lastFlushAt?: number;
};

@trace()
export class ViewsExtension implements Extension {
  private readonly viewActivityByKey = new Map<string, ViewActivity>();
  private readonly viewActivityKeysBySocket = new Map<string, Set<string>>();
  private readonly userActivityById = new Map<string, UserActivity>();
  private readonly flushTimer = setInterval(() => {
    void this.flushActivity();
  }, 5 * Second.ms);

  constructor() {
    this.flushTimer.unref?.();
  }

  /**
   * onChange hook. When a user changes a document, we update their "viewedAt"
   * timestamp if it's been more than a minute since their last change.
   *
   * @param data The change payload
   */
  async onChange({
    documentName,
    context,
    requestHeaders,
    socketId,
  }: withContext<onChangePayload>) {
    if (!context.user) {
      return;
    }

    const [, documentId] = documentName.split(".");
    const now = Date.now();
    const key = `${socketId}:${documentId}:${context.user.id}`;
    const viewActivity = this.viewActivityByKey.get(key);

    this.viewActivityByKey.set(key, {
      documentId,
      userId: context.user.id,
      lastSeenAt: now,
      lastFlushAt: viewActivity?.lastFlushAt,
    });

    const keysForSocket = this.viewActivityKeysBySocket.get(socketId) ?? new Set();
    keysForSocket.add(key);
    this.viewActivityKeysBySocket.set(socketId, keysForSocket);

    const userActivity = this.userActivityById.get(context.user.id);
    this.userActivityById.set(context.user.id, {
      ip: getCollaborationRequestIp(requestHeaders) ?? userActivity?.ip,
      lastSeenAt: now,
      lastFlushAt: userActivity?.lastFlushAt,
    });

    Logger.debug("multiplayer", `User ${context.user.id} viewed "${documentName}"`);
  }

  private async flushActivity() {
    const now = Date.now();
    const pending: Promise<unknown>[] = [];
    const pendingMeta: Array<{
      type: "view" | "user";
      documentId?: string;
      userId: string;
    }> = [];

    for (const activity of this.viewActivityByKey.values()) {
      if (
        activity.lastSeenAt <= (activity.lastFlushAt ?? 0) ||
        (activity.lastFlushAt && now - activity.lastFlushAt < Minute.ms)
      ) {
        continue;
      }

      activity.lastFlushAt = now;
      pending.push(View.touch(activity.documentId, activity.userId, true));
      pendingMeta.push({
        type: "view",
        documentId: activity.documentId,
        userId: activity.userId,
      });
    }

    for (const [userId, activity] of this.userActivityById.entries()) {
      if (
        activity.lastSeenAt <= (activity.lastFlushAt ?? 0) ||
        (activity.lastFlushAt && now - activity.lastFlushAt < 5 * Minute.ms)
      ) {
        continue;
      }

      const previousFlushAt = activity.lastFlushAt;
      activity.lastFlushAt = now;
      pending.push(
        User.touchActiveAt(userId, {
          ip: activity.ip,
          lastActiveAt: previousFlushAt ? new Date(previousFlushAt) : null,
        })
      );
      pendingMeta.push({
        type: "user",
        userId,
      });
    }

    if (!pending.length) {
      return;
    }

    const results = await Promise.allSettled(pending);
    results.forEach((result, index) => {
      if (result.status === "rejected") {
        Logger.warn("Failed to flush collaboration activity", {
          ...pendingMeta[index],
          error:
            result.reason instanceof Error
              ? result.reason.message
              : String(result.reason),
        });
      }
    });
  }

  /**
   * onDisconnect hook. When a user disconnects, we remove their socket from
   * the lastViewBySocket map to cleanup memory.
   *
   * @param data The disconnect payload
   */
  async onDisconnect({ socketId }: onDisconnectPayload) {
    const viewKeys = this.viewActivityKeysBySocket.get(socketId);
    if (viewKeys) {
      for (const key of viewKeys) {
        this.viewActivityByKey.delete(key);
      }
      this.viewActivityKeysBySocket.delete(socketId);
    }
  }

  /**
   * onDestroy hook
   * @param data The destroy payload
   */
  async onDestroy() {
    clearInterval(this.flushTimer);
    this.viewActivityByKey.clear();
    this.viewActivityKeysBySocket.clear();
    this.userActivityById.clear();
  }
}
