/**
 * probe-rea-mcp.ts
 *
 * Standalone script that spawns the REA MCP server over stdio,
 * lists available tools, and calls one harmless static tool
 * (binary_session with {}) to verify connectivity.
 *
 * Usage:
 *   npx tsx scripts/probe-rea-mcp.ts
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function main() {
  console.log("=== REA MCP Probe ===\n");

  // 1. Spawn REA MCP server via stdio
  console.log("Starting REA MCP server via: npx -y rea-agents@latest mcp");
  const transport = new StdioClientTransport({
    command: "cmd.exe",
    args: ["/d", "/c", "npx", "-y", "rea-agents@latest", "mcp"],
  });

  const client = new Client({
    name: "rea-studio-probe",
    version: "1.0.0",
  });

  await client.connect(transport);
  console.log("✅ Connected to REA MCP server\n");

  // 2. List tools
  console.log("--- tools/list ---");
  const toolsResult = await client.listTools();
  const tools = toolsResult.tools;
  console.log(`Total tools: ${tools.length}\n`);

  // Print first 20 tool names
  console.log("First 20 tools:");
  for (const tool of tools.slice(0, 20)) {
    console.log(`  - ${tool.name}`);
  }
  if (tools.length > 20) {
    console.log(`  ... and ${tools.length - 20} more\n`);
  }

  // 3. Call binary_session({}) — harmless status check
  console.log("--- Calling binary_session({}) ---");
  const result = await client.callTool({
    name: "binary_session",
    arguments: {},
  });

  // Display the result
  for (const item of result.content as Array<{ type: string; text?: string }>) {
    if (item.type === "text" && item.text) {
      // Parse and pretty-print JSON if possible
      try {
        const parsed = JSON.parse(item.text);
        console.log(JSON.stringify(parsed, null, 2).slice(0, 2000));
      } catch {
        console.log(item.text.slice(0, 2000));
      }
    }
  }

  console.log("\n✅ Probe complete — REA MCP server is working!");

  // 4. Clean up
  await client.close();
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Probe failed:", err);
  process.exit(1);
});
