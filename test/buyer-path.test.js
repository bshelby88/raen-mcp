// Buyer-path E2E: simulate a REAL external buyer with a fresh self-custodial wallet.
// Key is generated in-process and never printed. Two phases:
//  1) FREE FIRST CALL on royal-ruby ($0 challenge) -> full x402 settle round-trip with zero funds
//  2) contract-eye $0.05 paid call (needs funded wallet; expected to fail on balance if unfunded)
import { x402Client } from "@x402/core/client";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { wrapFetchWithPayment } from "@x402/fetch";
import { privateKeyToAccount } from "viem/accounts";

const pk = "0x" + [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, "0")).join("");
const acct = privateKeyToAccount(pk);
console.log("BUYER-WALLET:", acct.address);

const client = new x402Client();
client.register("eip155:8453", new ExactEvmScheme(acct));
const pay = wrapFetchWithPayment(globalThis.fetch.bind(globalThis), client);

async function call(label, url, body, headers = {}) {
  try {
    const res = await pay(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
    const t = await res.text();
    console.log(label, "HTTP", res.status, t.slice(0, 400));
    return res.status;
  } catch (e) {
    console.log(label, "ERROR:", String(e?.message || e).slice(0, 300));
    return null;
  }
}

// Phase 1: fresh wallet declares itself -> $0 challenge -> signed $0 payment -> settle
await call("PHASE1 free-first-call:", "https://royal-ruby-x402.fly.dev/api/law-lookup",
  { topic: "debt collection calls at work" }, { "x-payer-address": acct.address });

// Phase 2: $0.05 paid call on contract-eye (different service)
await call("PHASE2 contract-eye:", "https://contract-eye-x402.fly.dev/api/analyze",
  { contract_text: "Party A shall deliver goods within 30 days." });
