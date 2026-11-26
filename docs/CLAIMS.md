# Claims desk — paid but got nothing? (do not pay again)

Every RAEN x402 payment is tracked on-chain by the settlement collector, and a
stranded buyer has a fully self-serve recovery path. This document is the
gateway-side reference; the buyer-facing walkthrough is
[x402-cookbook recipe 22](https://github.com/bshelby88/x402-cookbook/blob/main/recipes/22-claims-desk.md).

Base URL: `https://settlement-collector.fly.dev`

## 1. Look up the payment — tx hash OR wallet address

```bash
curl -s "https://settlement-collector.fly.dev/storefront/claims?tx=<tx hash>"
curl -s "https://settlement-collector.fly.dev/storefront/claims?payer=<wallet address>"
```

- The lookup returns the order, its `claim_code`, `state`
  (`open` / `delivered` / `credit_redeemed` / `recorded`), `payee`
  (`canonical` / `legacy`), and delivery channel. No PII is returned.
- Claim codes are **derivable**: `RAEN-<sha256(tx)[:10]>` uppercase — knowledge
  of your own tx is all it takes, which is exactly what the lookup confirms.
- Rate limited at 30 lookups / 60s per IP (HTTP 429 when exceeded).

## 2. Register for (re)delivery

```bash
curl -s -X POST https://settlement-collector.fly.dev/storefront/register \
  -H "Content-Type: application/json" \
  -d '{"tx_or_intent":"<tx hash or payer address>","email":"you@example.com"}'
```

Machine buyers: `{"tx_or_intent":"…","agent_id":"…","callback_url":"https://…"}`
— receipt + delivery arrive as HTTP POSTs (T+0/T+1/T+7 onboarding steps too).
A registration whose target differs from a prior delivery record **re-arms
re-delivery** (stale-target deliveries do not stick).

## 3. Prepaid credits

`GET /storefront/credits/<code>` verifies (`redeemed:false/true`); 
`POST /storefront/credits/<code>/redeem` is the one-time redemption. The paid
services (contract-eye, tradingagents) accept the code as an `X-RAEN-CREDIT`
header instead of a new x402 payment.

## 4. Retired-payee stranding watch (live 2026-11-22)

The retired treasury `0x7861db4efc14a1ed5dd8c96c528a3796560f1393` is still
served by the fleet facilitator, so stale directories can still name it in a
challenge. The collector watches it: every USDC Transfer to that wallet
auto-creates an order **plus a claim code**, so the step-1 lookup finds those
payments too. Public status (honest zeros): `/storefront/legacy-watch`.

## Human contact

ops@royalruby.io — a human reads replies.
