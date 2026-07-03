import type { Mock } from "vitest";
vi.mock("@server/models", () => ({
  View: {
    touch: vi.fn(),
  },
  User: {
    touchActiveAt: vi.fn(),
  },
}));

vi.mock("@server/logging/Logger", () => ({
  __esModule: true,
  default: {
    debug: vi.fn(),
    warn: vi.fn(),
  },
}));

import Logger from "@server/logging/Logger";
import { User, View } from "@server/models";
import { ViewsExtension } from "./ViewsExtension";

describe("ViewsExtension", () => {
  let extension: ViewsExtension;

  beforeEach(() => {
    vi.useFakeTimers();
    (View.touch as Mock).mockResolvedValue(undefined);
    (User.touchActiveAt as Mock).mockResolvedValue(undefined);
    extension = new ViewsExtension();
  });

  afterEach(async () => {
    await extension.onDestroy();
    vi.useRealTimers();
    vi.clearAllMocks();
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
    } as unknown as Parameters<ViewsExtension["onChange"]>[0];

    await extension.onChange(payload);
    await extension.onChange(payload);
    await vi.advanceTimersByTimeAsync(5_000);

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
    await vi.advanceTimersByTimeAsync(5_000);

    expect(View.touch).toHaveBeenCalledTimes(1);
    expect(User.touchActiveAt).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(60_000);
    await extension.onChange(payload);
    await vi.advanceTimersByTimeAsync(5_000);

    expect(View.touch).toHaveBeenCalledTimes(2);
    expect(User.touchActiveAt).toHaveBeenCalledTimes(1);
  });

  it("never rejects when async activity flushes fail", async () => {
    (View.touch as Mock).mockRejectedValueOnce(new Error("view failed"));
    (User.touchActiveAt as Mock).mockRejectedValueOnce(
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
      } as unknown as Parameters<ViewsExtension["onChange"]>[0])
    ).resolves.toBeUndefined();

    await vi.advanceTimersByTimeAsync(5_000);

    expect(Logger.warn).toHaveBeenCalledTimes(2);
    expect(Logger.warn).toHaveBeenCalledWith(
      "Failed to flush collaboration activity",
      expect.objectContaining({
        userId: "user-2",
      })
    );
  });
});
