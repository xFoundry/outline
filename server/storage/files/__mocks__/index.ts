import { vi } from "vitest";

export default {
  upload: vi.fn().mockReturnValue("/endpoint/key"),

  getUploadUrl: vi.fn().mockReturnValue("http://mock/create"),

  getUrlForKey: vi.fn().mockReturnValue("http://mock/get"),

  getSignedUrl: vi.fn().mockReturnValue("http://s3mock"),

  stat: vi.fn().mockResolvedValue({ size: 123 }),

  getPresignedPost: vi.fn().mockReturnValue({}),
};
