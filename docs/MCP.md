# MCP Server (Streamable HTTP)

Outline exposes an MCP server at `POST /api/mcp` and `GET /api/mcp` using the
Streamable HTTP transport (protocol version `2025-06-18`).

## Authentication

All MCP requests require authentication via:

- API key (recommended for server-to-server): `Authorization: Bearer <api_key>`
- OAuth access token: `Authorization: Bearer <oauth_access_token>`

## Required Headers

After initialization, clients must include:

- `MCP-Protocol-Version: 2025-06-18`
- `Mcp-Session-Id: <session-id>`

## Initialize

Send an `initialize` request to start a session.

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2025-06-18",
    "capabilities": {},
    "clientInfo": { "name": "ExampleClient", "version": "1.0.0" }
  }
}
```

The server responds with an `InitializeResult` and sets `Mcp-Session-Id` and
`MCP-Protocol-Version` response headers. Use these headers for all subsequent
requests.

## List Tools

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/list"
}
```

## Call a Tool

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "documents_search",
    "arguments": { "query": "onboarding", "limit": 5 }
  }
}
```

## Notifications

Requests without an `id` are treated as JSON-RPC notifications and will return
HTTP 202 with an empty body.

## SSE (GET /api/mcp)

If you open an SSE stream with `GET /api/mcp`, you must include the session and
protocol headers. The server keeps the connection alive with periodic pings.

