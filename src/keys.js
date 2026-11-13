// Self-serve dev keys (INC-05, STACI Nov 2026).
// POST /keys/request {email} -> HMAC-signed verification link emailed via Resend.
// GET  /keys/verify?token=  -> issues a 30-day gateway Bearer key.
// Keys live in the gateway's key store (issued_keys.json next to the app; the
// store is merged with MCP_GATEWAY_KEY by the /mcp bearer gate in http.js).
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORE_FILE = path.join(__dirname, "issued_keys.json");
const SIGNING_SECRET = process.env.KEYS_SIGNING_SECRET || process.env.MCP_GATEWAY_KEY || "";
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const SENDER = "ops@royalruby.io";
const BASE_URL = "https://raen-mcp-gateway.fly.dev";
const KEY_TTL_MS = 30 * 86400000;      // issued keys: 30 days
const TOKEN_TTL_MS = 15 * 60000;       // verification links: 15 minutes
const RATE_LIMIT = 3;                  // per IP per day

// ---- key store ---------------------------------------------------------
let issuedKeys = {};
try {
  if (fs.existsSync(STORE_FILE)) issuedKeys = JSON.parse(fs.readFileSync(STORE_FILE, "utf8"));
} catch (e) { console.error("key store restore failed:", e.message); }

function persistStore() {
  try { fs.writeFileSync(STORE_FILE, JSON.stringify(issuedKeys, null, 2)); }
  catch (e) { console.error("key store persist failed:", e.message); }
}

export function isValidGatewayKey(candidate) {
  const expected = process.env.MCP_GATEWAY_KEY;
  if (expected && candidate === expected) return true;
  const rec = issuedKeys[candidate];
  return !!(rec && rec.expires_at > Date.now());
}

// ---- HMAC token --------------------------------------------------------
function b64url(buf) { return buf.toString("base64url"); }

function signToken(email, now) {
  const payload = b64url(Buffer.from(JSON.stringify({ e: email, iat: now, exp: now + TOKEN_TTL_MS })));
  const sig = b64url(crypto.createHmac("sha256", SIGNING_SECRET).update(payload).digest());
  return `${payload}.${sig}`;
}

function verifyToken(token) {
  if (typeof token !== "string" || token.split(".").length !== 2) return null;
  const [payload, sig] = token.split(".");
  const expectedSig = b64url(crypto.createHmac("sha256", SIGNING_SECRET).update(payload).digest());
  const a = Buffer.from(sig), b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (data.exp < Date.now()) return null;
    return data;
  } catch { return null; }
}

// ---- rate limiting (3 requests / day / IP) -----------------------------
const reqLog = {}; // ip -> [timestamps]
function rateLimited(ip) {
  const day = Date.now() - 86400000;
  const list = (reqLog[ip] ||= []).filter(t => t > day);
  reqLog[ip] = list;
  if (list.length >= RATE_LIMIT) return true;
  list.push(Date.now());
  return false;
}

// ---- email via Resend --------------------------------------------------
async function sendVerificationEmail(email, token) {
  if (!RESEND_API_KEY) throw new Error("email transport not configured (RESEND_API_KEY missing)");
  const link = `${BASE_URL}/keys/verify?token=${encodeURIComponent(token)}`;
  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: `RAEN Dev Keys <${SENDER}>`,
      to: [email],
      subject: "Your RAEN MCP gateway dev key (click to activate)",
      html: `<p>Click to activate your 30-day RAEN MCP gateway dev key:</p>
             <p><a href="${link}">${link}</a></p>
             <p>Link expires in 15 minutes. The key works on every RAEN x402 tool —
             per-call USDC pricing applies (<a href="${BASE_URL}/">${BASE_URL}</a>).</p>`,
    }),
  });
  if (!resp.ok) throw new Error(`resend ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function registerKeyRoutes(app) {
  app.post("/keys/request", async (req, res) => {
    const ip = req.get("fly-client-ip") || req.ip || "unknown";
    const email = String((req.body || {}).email || "").trim().toLowerCase().slice(0, 254);
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: "valid email required" });
    if (!SIGNING_SECRET) return res.status(503).json({ error: "key signing not configured" });
    if (rateLimited(ip)) return res.status(429).json({ error: "rate limit: 3 key requests per day per IP" });
    try {
      await sendVerificationEmail(email, signToken(email, Date.now()));
    } catch (e) {
      console.error("keys/request email failed:", e.message);
      // Resend 422 validation_error = the address itself can't receive mail
      // (e.g. example.com, RFC-2606 test domains). That's a caller mistake,
      // not a transport outage — say so with a 400 instead of a dead-end 503.
      if (/resend 422/.test(e.message) && /validation_error/i.test(e.message)) {
        return res.status(400).json({
          error: "that email address can't receive mail (the email provider rejected it) — double-check the address and try again",
        });
      }
      return res.status(503).json({ error: "could not send verification email; try again later" });
    }
    res.status(202).json({ ok: true, message: "check your email — a verification link is on its way" });
  });

  app.get("/keys/verify", (req, res) => {
    const data = verifyToken(String(req.query.token || ""));
    if (!data) return res.status(400).type("html").send(
      `<html><body style="font-family:system-ui;background:#0d1117;color:#e6edf3;max-width:640px;margin:3rem auto">
       <h1>Invalid or expired link</h1><p>Verification links expire after 15 minutes.
       Request a new key at <a style="color:#58a6ff" href="${BASE_URL}/keys/request">POST /keys/request</a>.</p></body></html>`);
    const key = `rak_${crypto.randomBytes(24).toString("hex")}`;
    issuedKeys[key] = {
      email: data.e,
      created_at: Date.now(),
      expires_at: Date.now() + KEY_TTL_MS,
    };
    persistStore();
    res.type("html").send(
      `<html><body style="font-family:system-ui;background:#0d1117;color:#e6edf3;max-width:640px;margin:3rem auto;padding:0 1rem">
       <h1>Your RAEN dev key is live</h1>
       <p>Valid 30 days, for <b>${data.e}</b>. Store it now — this page shows it once.</p>
       <p><code style="background:#21262d;padding:.3rem .6rem;border-radius:6px">${key}</code></p>
       <p>Use it:</p>
       <pre style="background:#161b22;padding:1rem;border-radius:6px;overflow:auto"><code>curl -X POST ${BASE_URL}/mcp \\
  -H "Authorization: Bearer ${key}" \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'</code></pre>
       <p>Per-call USDC pricing applies to tool calls. <a style="color:#58a6ff" href="${BASE_URL}/">Gateway home</a></p>
       </body></html>`);
  });
}
