// Direct x402 paid-call test: royal-ruby law-lookup ($0.05). Verifies real citations come back.
import { paidPost } from "../src/x402-client.js";

const r = await paidPost("https://royal-ruby-x402.fly.dev/api/law-lookup", {
  topic: process.argv[2] || "debt collection calls at work",
});
console.log("HTTP", r.status);
const s = r.json ? JSON.stringify(r.json) : r.text;
console.log(s.length > 4000 ? s.slice(0, 4000) + `\n...[truncated ${s.length} chars]` : s);
