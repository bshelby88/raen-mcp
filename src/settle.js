// x402 settlement wiring for the MCP gateway (the missing half of the paid loop).
// A buyer that receives the 402 challenge signs an x402 payment payload and retries
// with the PAYMENT-SIGNATURE header (x402 v2 standard) or the legacy X-PAYMENT header.
// This module decodes the payload, guards the amount/payTo, then verify+settle through
// the fleet facilitator before the tool result is released. Without it, a settled
// payment could never unlock a tool call (402-forever bug, fixed Nov 16 2026).
import crypto from "crypto";
import { toFunctionSelector } from "viem";

const FACILITATOR = (process.env.X402_FACILITATOR_URL || "https://raen-facilitator.fly.dev").replace(/\/+$/, "");
const HOST = "https://raen-mcp-gateway.fly.dev";
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const PAY_TO = "0x9b8a27e03CEbA490953cDa8AB1291c0E13bAf72f";
const NETWORK = "eip155:8453";

// Replay guard for pre-settled authorizations: a payload we already delivered on
// after an "authorization already used" settle failure must never deliver twice.
const deliveredPreSettled = new Map();

// USDC (FiatTokenV2) exposes authorizationState(authorizer, nonce) -> bool on Base:
// a reliable single eth_call (no getLogs needed) proving the exact EIP-3009
// authorization was executed. Used to authenticate pre-settled payloads on-chain.
const AUTH_STATE_SELECTOR = toFunctionSelector("authorizationState(address,bytes32)");
const BASE_RPC = process.env.BASE_RPC_URL || "https://base-pokt.nodies.app";

async function authorizationUsed(authorizer, nonce) {
  const data = AUTH_STATE_SELECTOR + String(authorizer).toLowerCase().replace(/^0x/, "").padStart(64, "0") + String(nonce).replace(/^0x/, "").padStart(64, "0");
  const res = await fetch(BASE_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: USDC_BASE, data }, "latest"] }),
    signal: AbortSignal.timeout(15000),
  });
  const j = await res.json();
  if (!j.result) throw new Error(`authorizationState eth_call failed: ${JSON.stringify(j).slice(0, 150)}`);
  return BigInt(j.result) !== 0n;
}

async function facilitatorCall(path, body) {
  const res = await fetch(`${FACILITATOR}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45000),
  });
  return res.json();
}

/**
 * Verify + settle an x402 payment payload for one tool call.
 * @param {string} rawHeader  PAYMENT-SIGNATURE / x-payment header value (base64 payload)
 * @param {string} toolName   requested tool
 * @param {number} usdPrice   tool price in USD
 * @returns {{ok:boolean, kind:string, detail?:string, tx?:string|null, receipt?:object}}
 */
export async function settleToolPayment(rawHeader, toolName, usdPrice) {
  let payload;
  try {
    const b64 = rawHeader.replace(/^base64:/i, "").trim();
    payload = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
  } catch (e) {
    return { ok: false, kind: "malformed_payload", detail: `unparseable payment payload: ${e.message}` };
  }
  if (!payload || typeof payload !== "object") {
    return { ok: false, kind: "malformed_payload", detail: "payment payload is not an object" };
  }

  const isV1 = payload.x402Version === 1;
  const requiredAmount = String(Math.round(usdPrice * 1e6));
  const resource = `${HOST}/mcp`;
  const description = `RAEN MCP Gateway tool call (${toolName})`;

  // On-chain guard on the SIGNED EIP-3009 authorization (defense in depth — the
  // signature covers from/to/value, so this cannot be forged by header edits).
  const auth = payload.payload?.authorization || payload.authorization || null;
  if (auth) {
    if (String(auth.to || "").toLowerCase() !== PAY_TO.toLowerCase()) {
      return { ok: false, kind: "payto_mismatch", detail: `signed authorization pays ${auth.to}, not the RAEN treasury` };
    }
    if (String(auth.value) !== requiredAmount) {
      return { ok: false, kind: "amount_mismatch", detail: `signed authorization value ${auth.value} != required ${requiredAmount}` };
    }
  }

  const requirements = isV1
    ? {
        scheme: "exact",
        network: "base",
        asset: USDC_BASE,
        payTo: PAY_TO,
        maxAmountRequired: requiredAmount,
        resource,
        description,
        mimeType: "application/json",
        maxTimeoutSeconds: 300,
      }
    : {
        scheme: "exact",
        network: NETWORK,
        asset: USDC_BASE,
        payTo: PAY_TO,
        amount: requiredAmount,
        maxTimeoutSeconds: 300,
        extra: { name: "USD Coin", version: "2" },
        resource,
        description,
        mimeType: "application/json",
      };

  // If the buyer signed against an `accepted` block, it must match our price and
  // payTo exactly — the facilitator verifies against the signed accepted, so a
  // smaller amount would otherwise unlock a full-price tool call.
  if (payload.accepted) {
    const acc = payload.accepted;
    const signedAmount = String(acc.amount ?? acc.maxAmountRequired ?? "");
    if (signedAmount !== requiredAmount) {
      return { ok: false, kind: "amount_mismatch", detail: `signed amount ${signedAmount || "missing"} != required ${requiredAmount}` };
    }
    if (String(acc.payTo || "").toLowerCase() !== PAY_TO.toLowerCase()) {
      return { ok: false, kind: "payto_mismatch", detail: "signed payTo is not the RAEN treasury" };
    }
    // Enrich the signed accepted with our resource fields so facilitator
    // model validation always has the complete requirements shape.
    payload.accepted = { ...acc, resource, description, mimeType: "application/json" };
  }

  const args = { paymentPayload: payload, paymentRequirements: requirements };

  // 1. Verify the payment (signature, balance, scheme) with the fleet facilitator.
  let v;
  try {
    v = await facilitatorCall("/facilitator/verify", args);
  } catch (e) {
    return { ok: false, kind: "verify_error", detail: `facilitator unreachable: ${e.message}` };
  }
  if (!v || v.isValid === false) {
    const detail = v ? `${v.invalidReason || "invalid"}${v.invalidMessage ? ": " + v.invalidMessage : ""}` : "facilitator returned no response";
    // A pre-settled authorization (buyer settled via the facilitator directly, then
    // retried) fails VERIFY with nonce-already-used — honor it the same as settle failure.
    if (detail.toLowerCase().includes("already_used") || detail.toLowerCase().includes("used or canceled") || detail.toLowerCase().includes("already")) {
      return deliverPreSettled(rawHeader, toolName, usdPrice, auth);
    }
    return { ok: false, kind: "verify_invalid", detail };
  }

  // 2. Settle the signed authorization on-chain.
  let s;
  try {
    s = await facilitatorCall("/facilitator/settle", args);
  } catch (e) {
    return { ok: false, kind: "settle_error", detail: `facilitator unreachable: ${e.message}` };
  }
  if (s && s.success) {
    const tx = s.transaction || (s.payout && s.payout.transaction) || null;
    // Record the payload so a replay can never ride the already-settled branch below.
    const hash = crypto.createHash("sha256").update(String(rawHeader)).digest("hex");
    deliveredPreSettled.set(hash, Date.now());
    if (deliveredPreSettled.size > 1000) {
      const oldest = [...deliveredPreSettled.entries()].sort((a, b) => a[1] - b[1])[0];
      if (oldest) deliveredPreSettled.delete(oldest[0]);
    }
    console.log(`[x402] settled ${toolName} $${usdPrice} tx=${tx} payer=${s.payer || "unknown"}`);
    return {
      ok: true,
      tx,
      receipt: { success: true, transaction: tx, network: s.network || NETWORK, payer: s.payer || null },
    };
  }

  const reason = String((s && (s.errorReason || s.error_message || s.error)) || "").toLowerCase();
  if (reason.includes("authorization_used") || reason.includes("already") || reason.includes("used")) {
    return deliverPreSettled(rawHeader, toolName, usdPrice, auth);
  }

  return { ok: false, kind: "settle_failed", detail: reason || JSON.stringify(s).slice(0, 300) };
}

/**
 * Deliver a tool call whose signed authorization was already settled on-chain
 * (buyer pre-settled via the facilitator directly, then retried with the header).
 * Requires on-chain proof that THIS exact (authorizer, nonce) authorization was
 * executed against USDC — never trust the header alone. The funds are then in the
 * treasury and the authorization is single-use. The per-payload replay guard is
 * best-effort across machines (in-memory); the on-chain proof plus the signed
 * from/to/value bound any replay to the payer's own already-paid authorization.
 */
async function deliverPreSettled(rawHeader, toolName, usdPrice, auth) {
  if (!auth || !auth.from || !auth.nonce) {
    return { ok: false, kind: "presettle_unverifiable", detail: "already-used payload carries no signed authorization to verify on-chain" };
  }
  try {
    if (!(await authorizationUsed(auth.from, auth.nonce))) {
      return { ok: false, kind: "presettle_unverified", detail: "on-chain authorizationState says this nonce was never executed" };
    }
  } catch (e) {
    return { ok: false, kind: "presettle_unverified", detail: `on-chain check failed: ${e.message}` };
  }
  const hash = crypto.createHash("sha256").update(String(rawHeader)).digest("hex");
  if (deliveredPreSettled.has(hash)) {
    return { ok: false, kind: "replay", detail: "this already-settled payment payload was already redeemed" };
  }
  deliveredPreSettled.set(hash, Date.now());
  if (deliveredPreSettled.size > 1000) {
    const oldest = [...deliveredPreSettled.entries()].sort((a, b) => a[1] - b[1])[0];
    if (oldest) deliveredPreSettled.delete(oldest[0]);
  }
  console.log(`[x402] ${toolName}: authorization already settled upstream — delivering (pre-settled flow)`);
  return { ok: true, tx: null, alreadySettled: true, receipt: { success: true, transaction: null, note: "already_settled" } };
}
