import { buildApiKey } from "@server/test/factories";
import { getTestServer } from "@server/test/support";

const server = getTestServer();

describe("MCP Streamable HTTP", () => {
  it("should initialize and require protocol/session headers for subsequent calls", async () => {
    const apiKey = await buildApiKey();

    const initRes = await server.post("/api/mcp", {
      headers: {
        Authorization: `Bearer ${apiKey.value}`,
      },
      body: {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "test-client", version: "1.0.0" },
        },
      },
    });

    const initBody = await initRes.json();
    expect(initRes.status).toEqual(200);
    expect(initBody.result.protocolVersion).toEqual("2025-06-18");

    const sessionId = initRes.headers.get("mcp-session-id");
    expect(sessionId).toBeTruthy();

    const missingHeadersRes = await server.post("/api/mcp", {
      headers: {
        Authorization: `Bearer ${apiKey.value}`,
      },
      body: {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
      },
    });

    expect(missingHeadersRes.status).toEqual(400);

    const toolsRes = await server.post("/api/mcp", {
      headers: {
        Authorization: `Bearer ${apiKey.value}`,
        "MCP-Protocol-Version": "2025-06-18",
        "Mcp-Session-Id": sessionId ?? "",
      },
      body: {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/list",
      },
    });

    const toolsBody = await toolsRes.json();
    expect(toolsRes.status).toEqual(200);
    expect(Array.isArray(toolsBody.result.tools)).toBe(true);
    expect(toolsBody.result.tools.length).toBeGreaterThan(0);
  });

  it("should return 202 for notifications", async () => {
    const apiKey = await buildApiKey();

    const initRes = await server.post("/api/mcp", {
      headers: {
        Authorization: `Bearer ${apiKey.value}`,
      },
      body: {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "test-client", version: "1.0.0" },
        },
      },
    });

    const sessionId = initRes.headers.get("mcp-session-id");

    const notificationRes = await server.post("/api/mcp", {
      headers: {
        Authorization: `Bearer ${apiKey.value}`,
        "MCP-Protocol-Version": "2025-06-18",
        "Mcp-Session-Id": sessionId ?? "",
      },
      body: {
        jsonrpc: "2.0",
        method: "ping",
      },
    });

    expect(notificationRes.status).toEqual(202);
  });
});
