import * as Y from "yjs";

jest.mock("@server/storage/redis", () => ({
  __esModule: true,
  default: {
    defaultClient: {
      smembers: jest.fn(),
      sadd: jest.fn(),
      set: jest.fn(),
    },
  },
}));

jest.mock("../commands/documentCollaborativeUpdater", () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock("../queues/tasks/CollaborativeDocumentPersistenceTask", () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    schedule: jest.fn(),
  })),
}));

jest.mock("@server/logging/Logger", () => ({
  __esModule: true,
  default: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import Logger from "@server/logging/Logger";
import Redis from "@server/storage/redis";
import documentCollaborativeUpdater from "../commands/documentCollaborativeUpdater";
import CollaborativeDocumentPersistenceTask from "../queues/tasks/CollaborativeDocumentPersistenceTask";
import PersistenceExtension from "./PersistenceExtension";

describe("PersistenceExtension", () => {
  let extension: PersistenceExtension;

  beforeEach(() => {
    extension = new PersistenceExtension();
    (Redis.defaultClient.smembers as jest.Mock).mockReset();
    (Redis.defaultClient.set as jest.Mock).mockReset();
    (documentCollaborativeUpdater as jest.Mock).mockReset();
    (
      CollaborativeDocumentPersistenceTask as unknown as jest.Mock
    ).mockImplementation(() => ({
      schedule: jest.fn().mockResolvedValue(undefined),
    }));
    (CollaborativeDocumentPersistenceTask as unknown as jest.Mock).mockClear();
    (Logger.warn as jest.Mock).mockReset();
    (Logger.error as jest.Mock).mockReset();
    (Redis.defaultClient.set as jest.Mock).mockResolvedValue("OK");
  });

  it("preserves no changes, no persist when there are no collaborators", async () => {
    (Redis.defaultClient.smembers as jest.Mock).mockResolvedValue([]);

    await extension.onStoreDocument({
      document: new Y.Doc(),
      context: {},
      documentName: "document.doc-1",
      clientsCount: 0,
      requestParameters: new URLSearchParams(),
    } as any);

    expect(documentCollaborativeUpdater).not.toHaveBeenCalled();
    expect(Redis.defaultClient.set).not.toHaveBeenCalled();
    expect(CollaborativeDocumentPersistenceTask).not.toHaveBeenCalled();
  });

  it("schedules a deduplicated retry for retryable persistence failures", async () => {
    (Redis.defaultClient.smembers as jest.Mock).mockResolvedValue(["user-1"]);
    (documentCollaborativeUpdater as jest.Mock).mockRejectedValueOnce(
      Object.assign(new Error("Operation timeout"), {
        name: "SequelizeConnectionAcquireTimeoutError",
      })
    );

    await extension.onStoreDocument({
      document: new Y.Doc(),
      context: {
        user: {
          id: "user-1",
        },
      },
      documentName: "document.doc-2",
      clientsCount: 0,
      requestParameters: new URLSearchParams("editorVersion=1.0.0"),
    } as any);

    const taskInstance = (
      CollaborativeDocumentPersistenceTask as unknown as jest.Mock
    ).mock.results[0].value;

    expect(Redis.defaultClient.set).toHaveBeenCalledTimes(1);
    expect(taskInstance.schedule).toHaveBeenCalledWith(
      {
        documentId: "doc-2",
      },
      expect.objectContaining({
        delay: 5_000,
        jobId: "collaborative-persist:doc-2",
      })
    );
    expect(Logger.warn).toHaveBeenCalledWith(
      "Collaborative persistence will retry",
      expect.objectContaining({
        documentId: "doc-2",
        reason: "acquire_timeout",
      })
    );
    expect(Logger.error).not.toHaveBeenCalled();
  });
});
