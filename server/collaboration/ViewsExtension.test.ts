jest.mock("@server/models", () => ({
  View: {
    touch: jest.fn(),
  },
  User: {
    touchActiveAt: jest.fn(),
  },
}));

jest.mock("@server/logging/Logger", () => ({
  __esModule: true,
  default: {
    debug: jest.fn(),
    warn: jest.fn(),
  },
}));

import Logger from "@server/logging/Logger";
import { User, View } from "@server/models";
import { ViewsExtension } from "./ViewsExtension";

describe("ViewsExtension", () => {
  let extension: ViewsExtension;

  beforeEach(() => {
    jest.useFakeTimers();
    (View.touch as jest.Mock).mockResolvedValue(undefined);
    (User.touchActiveAt as jest.Mock).mockResolvedValue(undefined);
    extension = new ViewsExtension();
  });

  afterEach(async () => {
    await extension.onDestroy();
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it("coalesces repeated changes and rate-limits activity writes", async () => {
    const payload = {
      documentName: "document.doc-1",
      socketId: "socket-1",
      requestHeaders: {
        "x-forwarded-for": "203.0.113.9",
      },
      context: {
        user: {
          id: "user-1",
        },
      },
    } as any;

    await extension.onChange(payload);
    await extension.onChange(payload);
    await jest.advanceTimersByTimeAsync(5_000);

    expect(View.touch).toHaveBeenCalledTimes(1);
    expect(View.touch).toHaveBeenCalledWith("doc-1", "user-1", true);
    expect(User.touchActiveAt).toHaveBeenCalledTimes(1);
    expect(User.touchActiveAt).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        ip: "203.0.113.9",
        lastActiveAt: null,
      })
    );

    await extension.onChange(payload);
    await jest.advanceTimersByTimeAsync(5_000);

    expect(View.touch).toHaveBeenCalledTimes(1);
    expect(User.touchActiveAt).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(60_000);
    await extension.onChange(payload);
    await jest.advanceTimersByTimeAsync(5_000);

    expect(View.touch).toHaveBeenCalledTimes(2);
    expect(User.touchActiveAt).toHaveBeenCalledTimes(1);
  });

  it("never rejects when async activity flushes fail", async () => {
    (View.touch as jest.Mock).mockRejectedValueOnce(new Error("view failed"));
    (User.touchActiveAt as jest.Mock).mockRejectedValueOnce(
      new Error("user failed")
    );

    await expect(
      extension.onChange({
        documentName: "document.doc-2",
        socketId: "socket-2",
        requestHeaders: {},
        context: {
          user: {
            id: "user-2",
          },
        },
      } as any)
    ).resolves.toBeUndefined();

    await jest.advanceTimersByTimeAsync(5_000);

    expect(Logger.warn).toHaveBeenCalledTimes(2);
    expect(Logger.warn).toHaveBeenCalledWith(
      "Failed to flush collaboration activity",
      expect.objectContaining({
        userId: "user-2",
      })
    );
  });
});
