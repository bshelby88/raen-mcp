// RAEN MCP gateway — streamable-HTTP entry point (for remote agents).
// Endpoint: POST /mcp  (MCP Streamable HTTP transport)
// Auth: Authorization: Bearer <MCP_GATEWAY_KEY>  (required when MCP_GATEWAY_KEY is set — it always should be,
//       because every tool call SPENDS the payer wallet's USDC).
import express from "express";
import { TOOLS } from "./tools.js";

const TOOL_NAMES = TOOLS.map((t) => t.name);
const PROTOCOL_VERSION = "2025-03-26";

function toolDefs() {
  return TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema }));
}

const app = express();
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => res.json({ ok: true, service: "raen-mcp-gateway", tools: TOOL_NAMES }));

// Stateless streamable-HTTP: direct JSON-RPC dispatch per POST (JSON responses, no session state).
app.post("/mcp", async (req, res) => {
  const expected = process.env.MCP_GATEWAY_KEY;
  if (expected) {
    const auth = req.headers.authorization || "";
    if (auth !== `Bearer ${expected}`) {
      return res.status(401).json({ error: "Unauthorized. Send Authorization: Bearer <MCP_GATEWAY_KEY>." });
    }
  }
  const body = req.body;
  const isNotification = body && body.jsonrpc === "2.0" && body.id === undefined;
  if (!body || body.jsonrpc !== "2.0" || (!isNotification && body.id === undefined)) {
    return res.status(400).json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid JSON-RPC 2.0 request" } });
  }
  if (isNotification) return res.status(202).end();
  try {
    let result;
    switch (body.method) {
      case "initialize":
        result = {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: {
            name: "raen-mcp",
            version: "1.0.0",
            instructions: "RAEN paid x402 services. Each tool call spends USDC on Base via the x402 protocol; prices are listed per tool.",
          },
        };
        break;
      case "ping":
        result = {};
        break;
      case "tools/list":
        result = { tools: toolDefs() };
        break;
      case "tools/call": {
        const { name, arguments: args } = body.params || {};
        const tool = TOOLS.find((t) => t.name === name);
        if (!tool) throw Object.assign(new Error(`Unknown tool: ${name}`), { code: -32602 });
        result = await tool.handler(args ?? {});
        break;
      }
      default:
        throw Object.assign(new Error(`Method not found: ${body.method}`), { code: -32601 });
    }
    res.json({ jsonrpc: "2.0", id: body.id, result });
  } catch (err) {
    const code = err.code === -32601 || err.code === -32602 ? err.code : -32000;
    res.json({ jsonrpc: "2.0", id: body.id, error: { code, message: err.message } });
  }
});

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`raen-mcp-gateway streamable-http listening on :${port}/mcp`));
