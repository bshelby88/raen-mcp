// Pre-settled flow test (Kip's scenario): settle via the facilitator DIRECTLY,
// then POST tools/call to the gateway with the settlement payload in the header.
// Also covers the legacy x-payment header variant.
// Usage: node test/presettle-e2e.mjs <gateway-origin> [x-payment]
import { x402Client } from "@x402/core/client";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";
import { readFileSync } from "node:fs";

const BASE = (process.argv[2] || "https://raen-mcp-gateway.fly.dev").replace(/\/+$/, "");
const LEGACY = process.argv[3] === "x-payment";
const pk = readFileSync(process.env.PAYER_KEY_FILE, "utf8").trim();
const acct = privateKeyToAccount(pk);
console.log("BUYER:", acct.address, "header:", LEGACY ? "x-payment" : "payment-signature");

const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "raen_law_lookup", arguments: { topic: "credit report dispute process" } } });
const rpcHeaders = { "Content-Type": "application/json", Accept: "application/json, text/event-stream" };

// 1) get the challenge
const r1 = await fetch(`${BASE}/mcp`, { method: "POST", headers: rpcHeaders, body });
const challenge = await r1.json();
if (r1.status !== 402) { console.log("FAIL: expected 402, got", r1.status); process.exit(1); }
const paymentRequired = { x402Version: 2, accepts: challenge.accepts, resource: challenge.resource };
console.log("challenge amount:", paymentRequired.accepts[0].amount);

// 2) sign a payment payload client-side
const client = new x402Client();
client.register("eip155:8453", new ExactEvmScheme(acct));
const payload = await client.createPaymentPayload(paymentRequired);
console.log("payload signed, x402Version:", payload.x402Version);

// 3) settle DIRECTLY through the facilitator (no gateway involved)
const Fac = "https://raen-facilitator.fly.dev/facilitator/settle";
const pr = { ...paymentRequired.accepts[0], resource: paymentRequired.resource.url, description: paymentRequired.resource.description, mimeType: "application/json" };
const settleRes = await fetch(Fac, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paymentPayload: payload, paymentRequirements: pr }) });
const settle = await settleRes.json();
console.log("direct facilitator settle ->", settleRes.status, JSON.stringify(settle).slice(0, 250));
if (!settle.success) { console.log("FAIL: direct settle did not succeed"); process.exit(1); }
console.log("PRE-SETTLED TX:", settle.transaction);

// 4) retry the tools/call with the payment header (gateway must honor the settle)
const hdrName = LEGACY ? "x-payment" : "payment-signature";
const r2 = await fetch(`${BASE}/mcp`, { method: "POST", headers: { ...rpcHeaders, [hdrName]: Buffer.from(JSON.stringify(payload)).toString("base64") }, body });
console.log("STEP4 tools/call with", hdrName, "->", r2.status);
const receipt = r2.headers.get("payment-response");
if (receipt) console.log("GATEWAY RECEIPT:", Buffer.from(receipt, "base64").toString("utf8").slice(0, 200));
const text = await r2.text();
console.log("RESULT:", text.slice(0, 500));
process.exit(r2.status === 200 && text.includes("federal_citations") ? 0 : 1);
