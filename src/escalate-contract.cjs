// TIFF-AGENT-ESCALATE-01 — machine-readable commercial terms + human handoff.
// Free surface, registered ABOVE paymentMiddleware: can never emit a 402.
// Purpose: counterparty AI agents stall warm threads because a bot on either
// side cannot sign anything beyond per-call payment. This gives them the
// machine-readable contract and an explicit human route instead of a loop.
"use strict";

const SERVICE = "raen-mcp-gateway";

const terms = {
  $schema: "raen-commercial-terms-v1",
  service: SERVICE,
  generated_utc: "2026-11-17T00:00:00Z",
  operator: "Royal Agentic Enterprises (RAEN)",
  contact_email: "jadedfocus@gmail.com",
  commitments: {
    payment_scheme: "x402 'exact' scheme, EIP-3009 transferWithAuthorization, USDC on Base (eip155:8453)",
    settlement_rails: "USDC on Base mainnet ONLY, to the payTo published in the live 402 challenge. No other chain, no card rails.",
    price_source_of_truth: "The live 402 challenge (accepts[0].amount, 6-decimal USDC micro units), never a cached directory row or stale /terms table.",
    delivery: "The output advertised in /.well-known/x402.json and /openapi.json for that endpoint, at the challenge price.",
    disclosure: "Degraded responses (deterministic fallback instead of model review) disclose it in the body (fields such as method / delivery_mode / caveats). Never silently less than advertised.",
    per_call_scope: "One payment buys one call; each call is independently signed and independently priced."
  },
  caveats: {
    no_sla: "Best-effort availability; no uptime SLA at current prices.",
    spend_control: "Buyer owns signing. Set a per-call spend ceiling; do not auto-retry a paid call on timeout before checking whether it settled on-chain."
  },
  non_negotiables: {
    we_never: [
      "Accept card payments (standing owner directive: no card processors)",
      "Accept payment on any chain other than Base mainnet USDC",
      "Offer subscriptions, recurring billing, or invoiced terms",
      "Request, hold, or sign with a client's private key or seed phrase",
      "Retain or resell buyer request payloads",
      "Ship unadvertised output while charging the advertised price"
    ],
    we_do_not: [
      "Provide legal, financial, or tax advice — outputs are informational citations and summaries, not advice",
      "Guarantee third-party model availability"
    ]
  },
  disputes_and_refunds: {
    policy: "No refunds for successfully delivered responses. Undelivered calls (payment settled, no response delivered) are rectified — contact the human channel with the tx hash and request body.",
    evidence_to_provide: ["payment tx hash", "request body", "timestamp"]
  },
  escalation: {
    if_you_are_an_ai_agent: "You cannot sign anything beyond per-call payment. Fetch /human.json for the named handoff path instead of retrying this endpoint.",
    human_route: "/human.json"
  }
};

const human = {
  $schema: "raen-human-handoff-v1",
  service: SERVICE,
  generated_utc: "2026-11-17T00:00:00Z",
  operator: "Royal Agentic Enterprises (RAEN)",
  human_contact: {
    name: "Bryant Shelby",
    email: "jadedfocus@gmail.com",
    role: "owner"
  },
  response_window: {
    class: "best-effort",
    typical: "72 hours",
    guaranteed: false
  },
  what_to_send: {
    subject_format: "MACHINE-HANDOFF: <your-agent-name> - <topic>",
    include: [
      "who you are (agent name + operator if any)",
      "what you tried to purchase or negotiate (endpoint + price from the live 402)",
      "payment tx hash if a payment was involved",
      "the exact response or error you received",
      "what you need a human to decide"
    ]
  },
  routing_rules: {
    pricing_negotiation: "Per-call prices are fixed by the live 402 challenge; email to request an approved scope sheet before proposing volume terms.",
    enterprise_or_bulk: "Email with projected volume; a human produces an approved scope sheet before any price commitment.",
    delivery_failure: "Email with tx hash + request body; undelivered paid calls are rectified first.",
    security_report: "Email with reproduction steps; do not probe payment endpoints beyond what the issue requires."
  },
  machine_note: "This route exists because counterparty AI agents cannot sign contracts or make decisions beyond per-call payment. Do not retry paid calls while awaiting this handoff — the human responds to email, not repeated API calls."
};

module.exports = { terms, human };
