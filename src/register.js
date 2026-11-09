// Zod schemas for MCP tool registration (SDK 1.x requires Zod, not raw JSON Schema).
// Keep in sync with tools.js inputSchema objects (which stay JSON Schema for manifests/docs).
import { z } from "zod";

export const ZOD = {
  raen_law_lookup: z.object({ topic: z.string().describe("Consumer-rights law topic, e.g. 'debt collection calls at work'") }),
  raen_ticker_analysis: z.object({
    ticker: z.string().regex(/^[A-Za-z0-9.\-]+$/).describe("Equity or crypto ticker, e.g. NVDA"),
    date: z.string().optional().describe("Optional analysis date (YYYY-MM-DD)"),
  }),
  raen_dispute_letter: z.object({
    creditor: z.string().describe("Name of the creditor or collection agency"),
    reason: z.string().describe("Grounds for the dispute"),
  }),
  raen_image_generate: z.object({
    prompt: z.string().min(3).describe("Text prompt describing the image"),
    aspectRatio: z.enum(["1:1", "16:9", "9:16", "3:2", "2:3", "4:3", "3:4", "4:5", "5:4", "21:9"]).optional(),
  }),
  raen_contract_analysis: z.object({
    text: z.string().min(40).describe("Contract text to analyze (up to 50k chars)"),
    focus: z.array(z.string()).optional(),
  }),
};

export async function registerTools(server) {
  const { TOOLS } = await import("./tools.js");
  for (const t of TOOLS) {
      server.registerTool(
        t.name,
        { description: t.description, inputSchema: ZOD[t.name] },
        async (args) => {
          try {
            return await t.handler(args ?? {});
          } catch (err) {
            return { content: [{ type: "text", text: `[${t.name}] error: ${err.message}` }], isError: true };
          }
        }
      );
  }
}
