// RAEN MCP gateway — streamable-HTTP entry point (for remote agents).
// Endpoint: POST /mcp  (MCP Streamable HTTP transport)
// Auth: Authorization: Bearer <MCP_GATEWAY_KEY>  (required when MCP_GATEWAY_KEY is set — it always should be,
//       because every tool call SPENDS the payer wallet's USDC).
import express from "express";
import { TOOLS } from "./tools.js";
import { registerKeyRoutes, isValidGatewayKey } from "./keys.js";
import { settleToolPayment } from "./settle.js";

const TOOL_NAMES = TOOLS.map((t) => t.name);
const PROTOCOL_VERSION = "2025-03-26";
// Per-tool price in USD (mirrors src/tools.js wrap() prices). 1 USDC = 1e6 units.
const TOOL_PRICES_USD = {
  raen_law_lookup: 0.05,
  raen_ticker_analysis: 0.05,
  raen_dispute_letter: 0.10,
  raen_image_generate: 0.01,
  raen_contract_analysis: 0.05,
};

// Canonical x402 v2 challenge (mirrors GET /mcp wall). Amount matches the requested tool.
function x402Challenge(toolName) {
  const usd = TOOL_PRICES_USD[toolName] ?? 0.05;
  return {
    x402Version: 2,
    error: "Payment required",
    resource: {
      url: "https://raen-mcp-gateway.fly.dev/mcp",
      description: `RAEN MCP Gateway tool call (${toolName}) — $${usd.toFixed(2)} USDC on Base Mainnet. First call free via charge-and-rebate, or use a free dev key from /keys/request.`,
      mimeType: "application/json",
    },
    accepts: [{
      scheme: "exact",
      network: "eip155:8453",
      amount: String(Math.round(usd * 1e6)),
      asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      payTo: "0x9b8a27e03CEbA490953cDa8AB1291c0E13bAf72f",
      maxTimeoutSeconds: 300,
      extra: { name: "USD Coin", version: "2" },
    }],
    extensions: {
      bazaar: { info: { input: { type: "http", queryParams: {}, method: "POST" }, output: { type: "json", example: { ok: true, result: "RAEN MCP Gateway tool result" } } } },
    },
  };
}

function toolDefs() {
  return TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
    // MCP tool annotations (ARC-63: mcptry listing score + client spend hints).
    annotations: {
      title: t.title || t.name,
      readOnlyHint: true, // paid API calls produce content; they modify no external system
      destructiveHint: false,
      idempotentHint: false, // each call is a separately settled x402 micropayment
      openWorldHint: true, // calls hit live RAEN x402 fleet endpoints
    },
  }));
}

const app = express();
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => res.json({ ok: true, service: "raen-mcp-gateway", tools: TOOL_NAMES }));

registerKeyRoutes(app);

// Discovery surfaces (static, no auth): x402scan reads /openapi.json, agents read /llms.txt,
// ERC-8004 verifiers read /.well-known/agent-registration.json.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const DOCS_DIR = dirname(fileURLToPath(import.meta.url));
const sendDoc = (file, type) => (_req, res) => { try { res.type(type).send(readFileSync(join(DOCS_DIR, file))); } catch { res.status(404).end(); } };
app.get("/llms.txt", sendDoc("llms.txt", "text/plain; charset=utf-8"));
app.get("/openapi.json", sendDoc("openapi.json", "application/json"));
app.get("/.well-known/x402", sendDoc("openapi.json", "application/json"));
app.get("/.well-known/agent-registration.json", sendDoc("agent-registration.json", "application/json"));
// A2A Protocol AgentCard (A2A discovery spec) — distinct from the ERC-8004 registration above.
app.get("/.well-known/agent.json", sendDoc("agent-card.json", "application/json"));

// TIFF-AGENT-ESCALATE-01 (2026-11-17): machine-readable commercial terms +
// human handoff. Free routes — never gated by the /mcp paywall.
// ESM-safe CJS interop: this file is an ES module (package.json type:module);
// bare `require` throws at import time and crash-loops the machine.
import { createRequire } from "module";
const nodeRequire = createRequire(import.meta.url);
const ESCALATE = nodeRequire("./escalate-contract.cjs");
app.get("/terms.json", (_req, res) => res.json(ESCALATE.terms));
app.get(["/human", "/human.json"], (_req, res) => res.json(ESCALATE.human));

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
<li><a style="color:#58a6ff" href="https://x402-playground.fly.dev/">x402 Live Playground</a> — watch a real 402 challenge decoded live, no wallet needed</li>
<li><a style="color:#58a6ff" href="https://x402-decoder.vercel.app">x402 Challenge Decoder</a> — paste a payment-required header, get decoded accepts[] JSON</li>
<li><a style="color:#58a6ff" href="https://bshelby88.github.io/x402-paywall-generator/">x402 Paywall Code Generator</a> — copy-paste 402 middleware (Express / Hono / FastAPI) on Base USDC</li>
<li><a style="color:#58a6ff" href="https://bshelby88.github.io/raen-postman/">Run in Postman</a> — one-click collection for all 12 services; unpaid requests fetch a live 402 free</li>
<li><a style="color:#58a6ff" href="https://bshelby88.github.io/raen-live-badges/">Live Badges</a> — embeddable per-service price badges ($0.01–$5.00)</li>
<li><a style="color:#58a6ff" href="https://raen-udap-explorer.vercel.app">State UDAP Explorer</a> — plain-English guide to the 10 most-cited state UDAP statutes</li>
<li><a style="color:#58a6ff" href="https://raen-referral.vercel.app">Referral Bounty</a> — $1 USDC for a working integration referral</li>
<li><a style="color:#58a6ff" href="/.well-known/agent.json">A2A Agent Card</a> · <a style="color:#58a6ff" href="/.well-known/agent-registration.json">ERC-8004 registration</a></li>
<li><a style="color:#58a6ff" href="https://raen.royalruby.io">RAEN Blog</a> · <a style="color:#58a6ff" href="/health">health</a></li>
</ul>
<p>Free 30-day dev key, self-serve: POST <code>/keys/request</code> with <code>{"email":"you@example.com"}</code> and click the link we email you. Registry: io.github.bshelby88/raen-mcp. Sales ledger: <a style="color:#58a6ff" href="https://settlement-collector.fly.dev/ledger">settlement-collector.fly.dev/ledger</a>.</p>
</body></html>`);
});


// OpenAPI discovery document (GET /openapi.json) — required for x402scan SIWX registration.
app.get("/openapi.json", (_req, res) => {
  const HOST = "https://raen-mcp-gateway.fly.dev";
  res.json({
    openapi: "3.0.3",
    info: { title: "RAEN MCP Gateway", version: "1.0.0", description: "Bearer-gated MCP server exposing RAEN's paid x402 services on Base Mainnet (USDC, pay per call)." },
    servers: [{ url: HOST }],
    paths: {
      "/mcp": {
        post: {
          summary: "MCP JSON-RPC endpoint (Streamable HTTP)",
          description: "Send JSON-RPC 2.0 requests: initialize, tools/list, tools/call. Authorization: Bearer required. x402 payment per tool call via Base Mainnet USDC.",
          security: [{ bearerAuth: [] }],
          requestBody: { required: true, content: { "application/json": { schema: { type: "object", properties: { jsonrpc: { type: "string", example: "2.0" }, id: { type: "integer" }, method: { type: "string", enum: ["initialize", "ping", "tools/list", "tools/call"] }, params: { type: "object" } }, required: ["jsonrpc", "id", "method"] } } } },
          responses: { "200": { description: "JSON-RPC response", content: { "application/json": { schema: { type: "object" } } } } }
        }
      },
      "/health": { get: { summary: "Health check", responses: { "200": { description: "OK" } } } }
    },
    "x-mcp-tools": TOOL_NAMES.map((name) => ({ name })),
    components: { securitySchemes: { bearerAuth: { type: "http", scheme: "bearer" } } }
  });
});

// x402 wall on GET /mcp — serves the canonical x402 v2 402 challenge for discovery/registration.
app.get("/mcp", (req, res) => {
  const challenge = {
    x402Version: 2,
    error: "Payment required",
    resource: {
      url: "https://raen-mcp-gateway.fly.dev/mcp",
      description: "RAEN MCP Gateway — bearer-gated MCP server with 5 paid x402 tools (legal research, ticker analysis, dispute letters, image generation, contract analysis). Pay per call in USDC on Base; first call free via charge-and-rebate.",
      mimeType: "application/json",
    },
    accepts: [{
      scheme: "exact",
      network: "eip155:8453",
      amount: "50000",
      asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      payTo: "0x9b8a27e03CEbA490953cDa8AB1291c0E13bAf72f",
      maxTimeoutSeconds: 300,
      extra: { name: "USD Coin", version: "2" },
    }],
    extensions: {
      bazaar: { info: { input: { type: "http", queryParams: {}, method: "POST" }, output: { type: "json", example: { ok: true, result: "RAEN MCP Gateway tool result" } } } },
    },
  };
  res.set("payment-required", Buffer.from(JSON.stringify(challenge)).toString("base64"));
  res.status(402).json(challenge);
});

// Stateless streamable-HTTP: direct JSON-RPC dispatch per POST (JSON responses, no session state).
app.post("/mcp", async (req, res) => {
  const body = req.body;
  const isNotification = body && body.jsonrpc === "2.0" && body.id === undefined;
  if (!body || body.jsonrpc !== "2.0" || (!isNotification && body.id === undefined)) {
    return res.status(400).json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid JSON-RPC 2.0 request" } });
  }
  if (isNotification) return res.status(202).end();
  // Auth: discovery methods (initialize/ping/tools/list) are open so x402 marketplaces
  // can verify the endpoint. tools/call requires either a valid Bearer key (dev keys /
  // MCP_GATEWAY_KEY) or an x402 payment — unpaid calls get the canonical 402 challenge.
  const auth = req.headers.authorization || "";
  const hasValidKey = auth.startsWith("Bearer ") && isValidGatewayKey(auth.slice(7));
  const payHeader = req.headers["payment-signature"] || req.headers["x-payment"] || null;
  if (body.method === "tools/call" && !hasValidKey) {
  const toolName = (body.params || {}).name || "unknown-tool";
  if (!payHeader) {
    const challenge = x402Challenge(toolName);
    challenge.paymentInstructions = [
      `1. Sign an x402 v2 exact-scheme payment for ${challenge.accepts[0].amount} (${TOOL_PRICES_USD[toolName]?.toFixed(2) ?? "0.05"} USDC) to ${challenge.accepts[0].payTo} on ${challenge.accepts[0].network}.`,
      `2. REPEAT this exact POST with the signed payload in the PAYMENT-SIGNATURE header (base64 JSON; legacy X-PAYMENT also accepted). The gateway verifies + settles via https://raen-facilitator.fly.dev/facilitator and returns the tool result with a payment-response header.`,
      `3. Already settled? Just retry with your payload — settled authorizations are honored (single-use).`,
    ].join(" ");
    res.set("payment-required", Buffer.from(JSON.stringify(challenge)).toString("base64"));
    return res.status(402).json(challenge);
  }
  // F1 SETTLE-ORDER DOCTRINE (Franklin ruling afc8fa4b, 2026-11-17): the tool
  // handler runs FIRST (deliverable is produced), settlement happens only on a
  // successful result, and the result is released only after settlement. The old
  // order (settle -> handler) charged payers for handler failures — the
  // VALIDATION_ONLY incident shape. With the new order a handler failure never
  // charges anyone, and the buyer's signed authorization was never settled, so it
  // remains valid for a clean retry.
  }
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
  // F1: settle AFTER the deliverable was produced, BEFORE releasing it.
  if (body.method === "tools/call" && !hasValidKey) {
    const toolName = (body.params || {}).name || "unknown-tool";
    const usd = TOOL_PRICES_USD[toolName] ?? 0.05;
    const settle = await settleToolPayment(payHeader, toolName, usd);
    if (!settle.ok) {
      const challenge = x402Challenge(toolName);
      challenge.error = `Payment rejected (${settle.kind}): ${settle.detail}`;
      res.set("payment-required", Buffer.from(JSON.stringify(challenge)).toString("base64"));
      return res.status(402).json(challenge);
    }
    res.set("payment-response", Buffer.from(JSON.stringify(settle.receipt)).toString("base64"));
    if (settle.tx) console.log(`[mcp] ${toolName} unlocked by settlement tx=${settle.tx}`);
  }
  res.json({ jsonrpc: "2.0", id: body.id, result });
  } catch (err) {
  // F1: this catch fires BEFORE any settlement has occurred on the paid path —
  // the payer was never charged. Say so explicitly.
  const code = err.code === -32601 || err.code === -32602 ? err.code : -32000;
  res.json({ jsonrpc: "2.0", id: body.id, error: { code, message: `${err.message} (no payment was taken; paid calls settle only after a successful result)` } });
  }
  });

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`raen-mcp-gateway streamable-http listening on :${port}/mcp`));
