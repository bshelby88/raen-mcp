// E2E buyer test for the gateway settlement path. Uses the real x402 client:
// POST tools/call (no key) -> 402 challenge -> client signs -> retries with
// PAYMENT-SIGNATURE -> gateway verifies+settles via facilitator -> tool result 200.
// Usage: node test/settlement-e2e.mjs <gateway-origin> (e.g. http://127.0.0.1:8931)
import { x402Client } from "@x402/core/client";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { wrapFetchWithPayment } from "@x402/fetch";
import { privateKeyToAccount } from "viem/accounts";
import { readFileSync } from "node:fs";

const BASE = (process.argv[2] || "http://127.0.0.1:8931").replace(/\/+$/, "");
const pk = readFileSync(process.env.PAYER_KEY_FILE, "utf8").trim();

const acct = privateKeyToAccount(pk);
console.log("BUYER:", acct.address);

// 1) raw unpaid call -> expect 402 with challenge
const unpaid = await fetch(`${BASE}/mcp`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "raen_law_lookup", arguments: { topic: "debt collection calls at work" } } }),
});
console.log("STEP1 unpaid tools/call ->", unpaid.status);
const challenge = await unpaid.json();
console.log("STEP1 challenge amount:", challenge.accepts?.[0]?.amount, "payTo:", challenge.accepts?.[0]?.payTo);
if (unpaid.status !== 402) { console.log("FAIL: expected 402"); process.exit(1); }
console.log("STEP1 paymentInstructions present:", !!challenge.paymentInstructions);

// 2) real x402 client loop -> auto 402 -> sign -> PAYMENT-SIGNATURE retry
const client = new x402Client();
client.register("eip155:8453", new ExactEvmScheme(acct));
const pay = wrapFetchWithPayment(globalThis.fetch.bind(globalThis), client);
const res = await pay(`${BASE}/mcp`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "raen_law_lookup", arguments: { topic: "debt collection calls at work" } } }),
});
console.log("STEP2 paid tools/call ->", res.status);
const payResp = res.headers.get("payment-response") || res.headers.get("x-payment-response");
if (payResp) console.log("SETTLEMENT RECEIPT:", Buffer.from(payResp, "base64").toString("utf8").slice(0, 400));
const text = await res.text();
console.log("TOOL RESULT:", text.slice(0, 700));
process.exit(res.status === 200 && text.includes("content") ? 0 : 1);
