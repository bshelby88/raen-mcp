# RAEN MCP Gateway — Pricing (live as of 2026-11-22)

One paid surface: **POST /mcp** (MCP JSON-RPC 2.0 over streamable HTTP).

| Call | Price |
|---|---|
| `tools/list` | FREE (discovery) |
| `tools/call` | $0.001-$0.01 USDC per call on Base (law lookup / contract analysis $0.005, ticker $0.001, dispute letter / image $0.01) (`eip155:8453`) |
| dev key (via `POST /keys/request`) | FREE — for evaluation integrations |
| first call charge-and-rebate | net $0 for a new paying wallet |

All prices USDC via x402 v2 `exact` scheme, EIP-3009 `transferWithAuthorization`.
`payTo` is always the canonical RAEN treasury
`0x9b8a27e03CEbA490953cDa8AB1291c0E13baf72F`.

Live 402 challenges are the source of truth: `POST /mcp` with a `tools/call`
request and decode the base64 `payment-required` header (`accepts[].amount`,
6 decimals → `5000` = $0.005).

Free discovery surfaces: `/llms.txt`, `/openapi.json`,
`/.well-known/x402.json`, `/.well-known/agent-registration.json`,
`/.well-known/agent.json`, `/health`.
