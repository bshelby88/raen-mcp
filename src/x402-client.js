// Shared x402 paid-call client for the RAEN MCP gateway.
// The payer private key is read from env RAEN_PAYER_KEY only — never logged, never committed.
import { x402Client } from "@x402/core/client";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { wrapFetchWithPayment } from "@x402/fetch";
import { privateKeyToAccount } from "viem/accounts";

let payerAccount;
let fetchWithPay;

/** Lazily build the x402 client from RAEN_PAYER_KEY. Throws if unset. */
function getPaidFetch() {
  if (fetchWithPay) return fetchWithPay;
  const pk = process.env.RAEN_PAYER_KEY;
  if (!pk) {
    throw new Error(
      "RAEN_PAYER_KEY is not set. Provide the x402 payer wallet private key via environment variable (never in code or CLI args)."
    );
  }
  if (!payerAccount) {
    payerAccount = privateKeyToAccount(pk.trim().startsWith("0x") ? pk.trim() : `0x${pk.trim()}`);
  }
  const client = new x402Client();
  client.register("eip155:8453", new ExactEvmScheme(payerAccount));
  fetchWithPay = wrapFetchWithPayment(globalThis.fetch.bind(globalThis), client);
  return fetchWithPay;
}

/**
 * Perform one x402-paid POST to a RAEN service.
 * @param {string} url  full endpoint URL
 * @param {object} body JSON body
 * @returns {Promise<{status:number, json:object, text:string, paymentHeader:string|null}>}
 */
export async function paidPost(url, body) {
  const fetchWithPay = getPaidFetch();
  const res = await fetchWithPay(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const paymentHeader = res.headers.get("payment-response") || res.headers.get("x-payment-response") || null;
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* non-JSON body returned as text */ }
  return { status: res.status, json, text, paymentHeader };
}

/** Truncate large responses (e.g. base64 images) for tool output. */
export function truncate(str, max = 12000) {
  if (typeof str !== "string") str = JSON.stringify(str) ?? "";
  return str.length <= max ? str : str.slice(0, max) + `\n... [truncated, ${str.length} chars total]`;
}
