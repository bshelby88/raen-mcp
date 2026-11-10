# raen-mcp

**Model Context Protocol server for RAEN's paid x402 services.** One MCP tool per service; each call settles a USDC micropayment on Base mainnet via the [x402](https://www.x402.org) protocol.

Live gateway (streamable HTTP): `https://raen-mcp-gateway.fly.dev/mcp`
Auth: `Authorization: Bearer <MCP_GATEWAY_KEY>` (gateway key required — tool calls spend real USDC).

## Tools

| Tool | Service | Price (USDC, Base) | Input |
|---|---|---|---|
| `raen_law_lookup` | royal-ruby | $0.05 | `{topic}` — FCRA/FDCPA/TILA/state-UDAP citations |
| `raen_ticker_analysis` | tradingagents | $0.05 | `{ticker, date?}` — synthetic market-consensus demo (not financial advice) |
| `raen_dispute_letter` | dispute-forge | $0.75 | `{creditor, reason}` — FCRA dispute letter + SVG certificate |
| `raen_image_generate` | nanobanana | $0.01 | `{prompt, aspectRatio?}` — AI image, base64 PNG |
| `raen_contract_analysis` | contract-eye | $0.05 | `{text, focus?}` — contract risk score + flagged clauses |

## Run it

### Stdio (local MCP clients / Smithery)

```json
{
  "mcpServers": {
    "raen-mcp": {
      "command": "node",
      "args": ["src/index.js"],
      "env": { "RAEN_PAYER_KEY": "0x...private key of a Base-mainnet USDC wallet..." }
    }
  }
}
```

### Streamable HTTP (remote)

```bash
RAEN_PAYER_KEY=0x... MCP_GATEWAY_KEY=<random-secret> node src/http.js   # :8080/mcp
```

Connect from any MCP client: `POST https://raen-mcp-gateway.fly.dev/mcp` with `Authorization: Bearer <key>`.

### Fly.io deploy

```bash
flyctl apps create raen-mcp-gateway
flyctl secrets set -a raen-mcp-gateway RAEN_PAYER_KEY=- MCP_GATEWAY_KEY=<secret>
flyctl deploy --remote-only
```

## How payment works

Tool handlers call `wrapFetchWithPayment(fetch, x402Client)` from `@x402/fetch` + `@x402/evm` (v2). First request → HTTP 402 with a `PAYMENT-REQUIRED` challenge header → client signs EIP-3009 `transferWithAuthorization` → settled via facilitator → final HTTP 200 with the product payload. Payer key comes only from `RAEN_PAYER_KEY` (env), never logged or committed.

## Endpoints (live manifests)

## Repo family
- Templates for agents: [raen-agent-kit](https://github.com/bshelby88/raen-agent-kit) — LangChain/LangGraph + CrewAI, plug into this gateway in minutes.
- Integration recipes for every endpoint: the [x402-cookbook](https://github.com/bshelby88/x402-cookbook) — copy-paste curl/Python recipes for the 402-challenge flow, free-first-call charge-and-rebate, and gateway config.

Each endpoint's path and schema are verified against the service's `/.well-known/x402.json`:

- https://royal-ruby-x402.fly.dev/.well-known/x402.json
- https://tradingagents-x402.fly.dev/.well-known/x402.json
- https://dispute-forge-x402.fly.dev/.well-known/x402.json
- https://nanobanana-x402.fly.dev/.well-known/x402.json
- https://contract-eye-x402.fly.dev/.well-known/x402.json

## Test evidence (Nov 9 2026)

- `npm run test:paid` → HTTP 200, real citations (`15 U.S.C. § 1681i`, `15 U.S.C. § 1692g`) for a $0.05 law-lookup.
- MCP client (SDK) over streamable HTTP → `tools/list` returns all 5 tools; `tools/call raen_law_lookup` → HTTP 200 with citations via the deployed gateway.

Information only — not legal or financial advice.
