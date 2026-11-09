// MCP tool definitions — one per RAEN x402 paid service.
// Endpoints verified against each service's live /.well-known/x402.json manifest (Nov 9 2026).
import { paidPost, truncate } from "./x402-client.js";

const BASE = {
  "royal-ruby": "https://royal-ruby-x402.fly.dev",
  "tradingagents": "https://tradingagents-x402.fly.dev",
  "dispute-forge": "https://dispute-forge-x402.fly.dev",
  "nanobanana": "https://nanobanana-x402.fly.dev",
  "contract-eye": "https://contract-eye-x402.fly.dev",
};

function wrap(name, price, result) {
  const body = result.json ? JSON.stringify(result.json) : result.text;
  return {
    content: [
      {
        type: "text",
        text: `[${name} · $${price} x402 paid · HTTP ${result.status}]\n` + truncate(body),
      },
    ],
    isError: result.status >= 400,
  };
}

export const TOOLS = [
  {
    name: "raen_law_lookup",
    description:
      "Look up US consumer-protection law citations (FCRA, FDCPA, TILA, state UDAP) on a topic. Returns formal citations, plain-English summaries, reporting timelines, and statutes of limitations. Information only, not legal advice. $0.05 USDC (x402, Base).",
    inputSchema: {
      type: "object",
      properties: {
        topic: { type: "string", description: "Consumer-rights law topic, e.g. 'debt collection calls at work'" },
      },
      required: ["topic"],
    },
    async handler(args) {
      const r = await paidPost(`${BASE["royal-ruby"]}/api/law-lookup`, { topic: args.topic });
      return wrap("royal-ruby law-lookup", "0.05", r);
    },
  },
  {
    name: "raen_ticker_analysis",
    description:
      "Request a synthetic ticker market-consensus demo (TradingAgents payload). No live market data; not financial advice. $0.05 USDC (x402, Base).",
    inputSchema: {
      type: "object",
      properties: {
        ticker: { type: "string", description: "Equity or crypto ticker, e.g. NVDA", pattern: "^[A-Za-z0-9.\\-]+$" },
        date: { type: "string", description: "Optional analysis date (YYYY-MM-DD)" },
      },
      required: ["ticker"],
    },
    async handler(args) {
      const body = { ticker: args.ticker };
      if (args.date) body.date = args.date;
      const r = await paidPost(`${BASE["tradingagents"]}/api/analyze-ticker`, body);
      return wrap("tradingagents analyze-ticker", "0.05", r);
    },
  },
  {
    name: "raen_dispute_letter",
    description:
      "Generate an FCRA-compliant credit dispute letter plus an SVG certificate of dispute (Dispute-Forge). $0.75 USDC (x402, Base).",
    inputSchema: {
      type: "object",
      properties: {
        creditor: { type: "string", description: "Name of the creditor or collection agency" },
        reason: { type: "string", description: "Grounds for the dispute, e.g. 'Debt is not mine / inaccurate reporting'" },
      },
      required: ["creditor", "reason"],
    },
    async handler(args) {
      const r = await paidPost(`${BASE["dispute-forge"]}/api/dispute-pack`, {
        creditor: args.creditor,
        reason: args.reason,
      });
      return wrap("dispute-forge dispute-pack", "0.75", r);
    },
  },
  {
    name: "raen_image_generate",
    description:
      "Generate an AI image from a text prompt (Gemini upstream). Returns base64 PNG metadata/JSON. $0.01 USDC (x402, Base).",
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string", minLength: 3, description: "Text prompt describing the image" },
        aspectRatio: {
          type: "string",
          enum: ["1:1", "16:9", "9:16", "3:2", "2:3", "4:3", "3:4", "4:5", "5:4", "21:9"],
          description: "Output aspect ratio (default 1:1)",
        },
      },
      required: ["prompt"],
    },
    async handler(args) {
      const body = { prompt: args.prompt };
      if (args.aspectRatio) body.aspectRatio = args.aspectRatio;
      const r = await paidPost(`${BASE["nanobanana"]}/api/generate-image`, body);
      return wrap("nanobanana generate-image", "0.01", r);
    },
  },
  {
    name: "raen_contract_analysis",
    description:
      "Analyze contract text for risky, one-sided, or unusual clauses. Returns a risk score, flagged clauses with severity/explanation/suggested edits (Contract-Eye). $0.05 USDC (x402, Base).",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", minLength: 40, description: "Contract text to analyze (up to 50k chars)" },
        focus: { type: "array", items: { type: "string" }, description: "Optional clause categories to focus on" },
      },
      required: ["text"],
    },
    async handler(args) {
      const body = { text: args.text };
      if (args.focus) body.focus = args.focus;
      const r = await paidPost(`${BASE["contract-eye"]}/api/analyze-contract`, body);
      return wrap("contract-eye analyze-contract", "0.05", r);
    },
  },
];

export function toolMap() {
  return Object.fromEntries(TOOLS.map((t) => [t.name, t]));
}
