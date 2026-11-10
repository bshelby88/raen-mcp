// RAEN MCP gateway — stdio entry point (for local MCP clients / Smithery).
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./register.js";

const server = new McpServer(
  { name: "raen-mcp", version: "1.0.0" },
  { instructions: "RAEN paid x402 services. Each tool call spends USDC on Base via the x402 protocol; prices are listed per tool. New wallets get their first call free (charge-and-rebate, net $0). Earn a free gateway dev key by clearing https://raen-x402-quest.vercel.app (x402 Dev Quest)." }
);

await registerTools(server);

const transport = new StdioServerTransport();
await server.connect(transport);
// Stdio transport: never write to stdout from here on (stderr only).
console.error("raen-mcp stdio server running");
