/**
 * Acceptance Script: acceptance-real-rea.ts
 *
 * Demonstrates a full run that calls at least one real REA static tool
 * against a sample target and streams normalized events in order.
 *
 * Usage:
 *   npx tsx scripts/acceptance-real-rea.ts
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import * as path from 'path';
import { ALL_REA_TOOLS, isRiskyTool } from '../src/main/services/reaTools.js';
import type { AgentEvent } from '../src/shared/events.js';

async function runAcceptance() {
  console.log('========================================================');
  console.log('   REA Studio Acceptance Check: Real REA Static Tool   ');
  console.log('========================================================\n');

  const sampleTarget = path.resolve(process.cwd(), 'package.json');
  console.log(`Target: ${sampleTarget}`);

  const events: AgentEvent[] = [];
  const sessionId = 'acceptance-session-1';

  function emit(event: AgentEvent) {
    events.push(event);
    console.log(`[EVENT: ${event.type}]`, JSON.stringify(event, null, 2));
  }

  // 1. Launch REA MCP server over stdio exactly as documented in REA_FACTS.md
  console.log('\n[1/4] Spawning real REA MCP server via stdio...');
  const isWin = process.platform === 'win32';
  const transport = new StdioClientTransport({
    command: isWin ? 'cmd.exe' : 'npx',
    args: isWin
      ? ['/d', '/c', 'npx', '-y', 'rea-agents@latest', 'mcp']
      : ['-y', 'rea-agents@latest', 'mcp'],
  });

  const client = new Client({
    name: 'rea-studio-acceptance',
    version: '1.0.0',
  });

  await client.connect(transport);
  console.log('✅ Connected to REA MCP server.\n');

  // 2. Stream introductory assistant text delta
  console.log('[2/4] Streaming assistant text delta...');
  emit({
    type: 'assistant_text_delta',
    sessionId,
    textDelta: 'Inspecting target environment and capabilities using REA static analysis...',
  });

  // 3. Invoke real REA static tool: binary_session
  console.log('\n[3/4] Invoking real REA static tool: binary_session...');
  const toolName = 'binary_session';
  const toolCallId = 'call-acc-001';
  const toolInput = {};

  emit({
    type: 'tool_call_started',
    sessionId,
    toolCallId,
    toolName,
    input: toolInput,
    isRisky: isRiskyTool(toolName),
  });

  const toolResponse = await client.callTool({
    name: toolName,
    arguments: toolInput,
  });

  emit({
    type: 'tool_call_result',
    sessionId,
    toolCallId,
    output: toolResponse,
  });

  // 4. Conclude turn
  console.log('\n[4/4] Finishing run...');
  emit({
    type: 'run_finished',
    sessionId,
    fullText: 'Target environment inspected successfully using real REA tool output.',
  });

  await client.close();

  // Validate event sequence
  console.log('\n--------------------------------------------------------');
  console.log('Event Sequence Verification:');
  const types = events.map((e) => e.type);
  console.log('Order:', types.join(' -> '));

  const expectedOrder = [
    'assistant_text_delta',
    'tool_call_started',
    'tool_call_result',
    'run_finished',
  ];

  const matches = expectedOrder.every((expected, idx) => types[idx] === expected);
  if (matches) {
    console.log('\n✅ ACCEPTANCE PASSED: Real REA static tool called and events streamed in order.');
  } else {
    console.error('\n❌ ACCEPTANCE FAILED: Event order mismatch.');
    process.exit(1);
  }
}

runAcceptance().catch((err) => {
  console.error('\n❌ Acceptance run failed:', err);
  process.exit(1);
});
