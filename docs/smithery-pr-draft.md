# Smithery submission — PR draft (prepared, not submitted)

Repo: `bshelby88/raen-mcp`
Smithery config: `smithery.yaml` at repo root (stdio, `node src/index.js`, entrypoint `src/index.js`).
Required env: `RAEN_PAYER_KEY` (declared in smithery.yaml `environmentVariables`).

## Submission steps (owner or agent with GitHub access)

1. Repo must be public (or Smithery-linked private) at github.com/bshelby88/raen-mcp — done.
2. Open PR against https://github.com/smithery-ai/mcp-registry adding to `servers/raen-mcp.yaml`:

```yaml
name: raen-mcp
displayName: RAEN x402 Gateway
description: >
  MCP server exposing RAEN's paid x402 services as tools: consumer-law lookup ($0.05),
  ticker analysis ($0.05), FCRA dispute letters ($0.75), AI image generation ($0.01),
  contract risk analysis ($0.05). Each call settles USDC on Base via the x402 protocol.
publisher:
  name: Royal Agentic Enterprises (RAEN)
  url: https://github.com/bshelby88
sourceUrl: https://github.com/bshelby88/raen-mcp
homepage: https://raen-mcp-gateway.fly.dev
license: MIT
install:
  stdio:
    type: stdio
    command: node
    args:
      - src/index.js
    env:
      - name: RAEN_PAYER_KEY
        description: Private key of an EVM wallet funded with USDC on Base mainnet (x402 payer).
        isSecret: true
        isRequired: true
tools:
  - name: raen_law_lookup
    description: Look up US consumer-protection law citations (FCRA, FDCPA, TILA, state UDAP). $0.05 USDC per call.
  - name: raen_ticker_analysis
    description: Synthetic ticker market-consensus demo (not financial advice). $0.05 USDC per call.
  - name: raen_dispute_letter
    description: FCRA-compliant credit dispute letter + SVG certificate. $0.75 USDC per call.
  - name: raen_image_generate
    description: AI image generation from a text prompt (base64 PNG). $0.01 USDC per call.
  - name: raen_contract_analysis
    description: Contract risk analysis — score, flagged clauses, suggested edits. $0.05 USDC per call.
keywords:
  - x402
  - payments
  - usdc
  - base
  - consumer-rights
  - law
  - dispute-letters
  - image-generation
  - contract-analysis
```

3. PR title: `Add raen-mcp — RAEN x402 paid-services gateway (law lookup, dispute letters, images, contract analysis)`
4. PR body: link repo + live gateway + test evidence (paid call returned 15 U.S.C. § 1681i / § 1692g citations, HTTP 200).
5. Smithery validation: `npx @smithery/cli validate smithery.yaml` before opening the PR (requires network).

Notes:
- Per RAEN charter, do NOT create external accounts (Smithery account / registry login) — submission materials only; final submit is owner-side.
- The registry PR format above follows the current smithery-ai/mcp-registry server schema; re-check the registry's CONTRIBUTING.md at submission time for schema drift.
