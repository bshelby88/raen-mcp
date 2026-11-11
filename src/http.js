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

// Landing page (GET /): lightweight discoverability surface linking the Agent Kit and free tools.
app.get("/", (_req, res) => {
  res.type("html").send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>RAEN MCP Gateway — paid x402 tools for AI agents</title>
<meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:system-ui;background:#0d1117;color:#e6edf3;max-width:640px;margin:3rem auto;padding:0 1rem">
<h1>RAEN MCP Gateway</h1>
<p>Bearer-gated MCP server exposing RAEN's paid x402 services on Base Mainnet (USDC, pay per call $0.01–$5.00).</p>
<p><b>Connect:</b> POST JSON-RPC to <code>/mcp</code> with <code>Authorization: Bearer &lt;key&gt;</code>. Tools: raen_law_lookup, raen_ticker_analysis, raen_dispute_letter, raen_image_generate, raen_contract_analysis.</p>
<ul>
<li><a style="color:#58a6ff" href="https://github.com/bshelby88/raen-agent-kit">RAEN Agent Kit</a> — LangChain/LangGraph + CrewAI templates</li>
<li><a style="color:#58a6ff" href="https://github.com/bshelby88/x402-cookbook">x402 Integration Cookbook</a> — copy-paste client recipes</li>
<li><a style="color:#58a6ff" href="https://bshelby88.github.io/x402-linter/">x402 Manifest Linter</a> — validate your x402.json free</li>
<li><a style="color:#58a6ff" href="https://bshelby88.github.io/x402-scorecard/">x402 Launch Readiness Scorecard</a> — is your paid API agent-ready? 60-second score</li>
<li><a style="color:#58a6ff" href="https://bshelby88.github.io/raen-payback-calculator/">x402 Payback Calculator</a> — pay-per-call vs flat SaaS, side by side</li>
<li><a style="color:#58a6ff" href="https://raen.royalruby.io">RAEN Blog</a> · <a style="color:#58a6ff" href="/health">health</a></li>
</ul>
<p>Free dev key: email ops@royalruby.io, subject "AGENT KIT KEY". Registry: io.github.bshelby88/raen-mcp.</p>
</body></html>`);
});


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
            instructions: "RAEN paid x402 services. Each tool call spends USDC on Base via the x402 protocol; prices are listed per tool. New wallets get their first call free (charge-and-rebate, net $0). Earn a free gateway dev key by clearing https://raen-x402-quest.vercel.app (x402 Dev Quest).",
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
