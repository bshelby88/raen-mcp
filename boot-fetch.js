// Boot shim: fetch the latest gateway src files from GitHub (main) before starting the server.
// Interim path while the Fly registry push is unavailable from the ops host; a normal
// `flyctl deploy` (image with these files baked in) supersedes this shim.
const fs = require("fs");
const BASE = "https://raw.githubusercontent.com/bshelby88/raen-mcp/main/src/";
const FILES = ["agent-card.json", "http.js", "llms.txt"];
(async () => {
  for (const f of FILES) {
    const r = await fetch(BASE + f);
    if (!r.ok) throw new Error(`${BASE}${f}: HTTP ${r.status}`);
    fs.writeFileSync("/app/src/" + f, Buffer.from(await r.arrayBuffer()));
    console.error("boot-fetch: updated", f);
  }
})().then(() => require("/app/src/http.js"))
  .catch((e) => {
    console.error("boot-fetch failed, starting baked-in server:", e.message);
    require("/app/src/http.js");
  });
