import type { Session, ToolCall, ChatMessage } from '../../shared/ipc';

export type EvidenceCategory = 'finding' | 'reference' | 'unknown_limitation';

export interface EvidenceLocation {
  file?: string;
  function?: string;
  address?: string;
  offset?: string | number;
  url?: string;
  line?: number;
}

export interface EvidenceSnippet {
  code: string;
  language?: string;
  startLine?: number;
}

export interface EvidenceItem {
  id: string;
  toolCallId: string;
  messageId?: string;
  sessionId: string;
  category: EvidenceCategory;
  title: string;
  description?: string;
  sourceTool: string;
  timestamp: string;
  location?: EvidenceLocation;
  snippet?: EvidenceSnippet;
  confidenceNote?: string;
  limitations?: string[];
  rawContent?: unknown;
  isPinned?: boolean;
}

/**
 * Safely parse output into an object if it arrived as a string or content array.
 */
function normalizeOutput(output: unknown): unknown {
  if (output === null || output === undefined) return null;
  if (typeof output === 'string') {
    try {
      return JSON.parse(output);
    } catch {
      return { text: output };
    }
  }
  if (typeof output === 'object') {
    const obj = output as Record<string, unknown>;
    // Check if it's standard MCP response: { content: [{ type: 'text', text: '...' }] }
    if (Array.isArray(obj.content) && obj.content.length > 0 && !obj.structuredContent) {
      const first = obj.content[0] as { type?: string; text?: string };
      if (first && typeof first.text === 'string') {
        try {
          return JSON.parse(first.text);
        } catch {
          return { text: first.text };
        }
      }
    }
  }
  return output;
}

/**
 * Parse a tool invocation and its output into concrete Evidence items adhering
 * to REA's MCP result contracts.
 */
export function extractEvidenceFromToolCall(
  toolCall: ToolCall,
  sessionId: string,
  messageId?: string
): EvidenceItem[] {
  const items: EvidenceItem[] = [];
  if (!toolCall.output && !toolCall.error) return items;

  const rawOut = normalizeOutput(toolCall.output);
  if (!rawOut || typeof rawOut !== 'object') {
    if (rawOut) {
      items.push({
        id: `ev-${toolCall.id}-raw`,
        toolCallId: toolCall.id,
        messageId,
        sessionId,
        category: 'finding',
        title: `Observation from ${toolCall.toolName}`,
        sourceTool: toolCall.toolName,
        timestamp: toolCall.completedAt || toolCall.startedAt,
        rawContent: rawOut,
      });
    }
    return items;
  }

  const outObj = rawOut as Record<string, unknown>;

  // Check REA structured content envelopes
  const structured = (outObj.structuredContent || outObj) as Record<string, unknown>;
  const normalized = (structured.normalized_result || structured) as Record<string, unknown>;

  // 1. Check for Unknowns & Limitations in REA responses
  const limitationsList: string[] = [];
  if (Array.isArray(structured.limitations)) {
    for (const lim of structured.limitations) {
      if (typeof lim === 'string') limitationsList.push(lim);
      else if (lim && typeof lim === 'object' && 'reason' in lim) {
        limitationsList.push(String((lim as { reason: unknown }).reason));
      }
    }
  } else if (Array.isArray(outObj.limitations)) {
    for (const lim of outObj.limitations) {
      if (typeof lim === 'string') limitationsList.push(lim);
    }
  }

  if (limitationsList.length > 0) {
    items.push({
      id: `ev-${toolCall.id}-limitations`,
      toolCallId: toolCall.id,
      messageId,
      sessionId,
      category: 'unknown_limitation',
      title: `Analysis Limitations reported by ${toolCall.toolName}`,
      description: limitationsList.join('; '),
      sourceTool: toolCall.toolName,
      timestamp: toolCall.completedAt || toolCall.startedAt,
      limitations: limitationsList,
    });
  }

  // 2. Facet availability limitations (e.g. function dossiers)
  if (normalized.facet_availability && typeof normalized.facet_availability === 'object') {
    const facets = normalized.facet_availability as Record<string, { available?: boolean; reason?: string }>;
    for (const [facet, info] of Object.entries(facets)) {
      if (info && info.available === false) {
        items.push({
          id: `ev-${toolCall.id}-facet-${facet}`,
          toolCallId: toolCall.id,
          messageId,
          sessionId,
          category: 'unknown_limitation',
          title: `Unavailable Facet: ${facet}`,
          description: info.reason || 'Facet was not available in provider report',
          sourceTool: toolCall.toolName,
          timestamp: toolCall.completedAt || toolCall.startedAt,
          confidenceNote: 'Provider constraint',
        });
      }
    }
  }

  // 3. Unknowns tools (record_unknown, list_unknowns)
  if (
    toolCall.toolName === 'record_unknown' ||
    toolCall.toolName === 'list_unknowns' ||
    toolCall.toolName === 'update_unknown'
  ) {
    const unknowns = Array.isArray(normalized.unknowns)
      ? (normalized.unknowns as Record<string, unknown>[])
      : [normalized];

    for (let i = 0; i < unknowns.length; i++) {
      const u = unknowns[i];
      if (u.question || u.description) {
        items.push({
          id: `ev-${toolCall.id}-unknown-${i}`,
          toolCallId: toolCall.id,
          messageId,
          sessionId,
          category: 'unknown_limitation',
          title: String(u.question || u.description),
          description: u.domain ? `Domain: ${String(u.domain)} | Status: ${String(u.status || 'open')}` : undefined,
          sourceTool: toolCall.toolName,
          timestamp: toolCall.completedAt || toolCall.startedAt,
          rawContent: u,
        });
      }
    }
    return items;
  }

  // 4. Code References & Decompilation (pseudocode, assembly, source)
  if (
    normalized.pseudocode ||
    normalized.pseudo_code ||
    (normalized.code && (toolCall.toolName.includes('pseudo') || toolCall.toolName.includes('decompile')))
  ) {
    const code = String(normalized.pseudocode || normalized.pseudo_code || normalized.code);
    const funcName = String(normalized.function_name || normalized.name || normalized.procedure || 'Decompiled Function');
    const addr = normalized.address ? String(normalized.address) : undefined;
    items.push({
      id: `ev-${toolCall.id}-pseudocode`,
      toolCallId: toolCall.id,
      messageId,
      sessionId,
      category: 'reference',
      title: `Decompiled Pseudocode: ${funcName}`,
      sourceTool: toolCall.toolName,
      timestamp: toolCall.completedAt || toolCall.startedAt,
      location: {
        function: funcName,
        address: addr,
        file: normalized.file ? String(normalized.file) : undefined,
      },
      snippet: {
        code,
        language: 'c',
        startLine: 1,
      },
      limitations: limitationsList.length > 0 ? limitationsList : undefined,
    });
  }

  if (normalized.assembly || normalized.instructions || normalized.disassembly) {
    const asm = String(normalized.assembly || normalized.instructions || normalized.disassembly);
    const funcName = String(normalized.function_name || normalized.name || 'Disassembly');
    items.push({
      id: `ev-${toolCall.id}-assembly`,
      toolCallId: toolCall.id,
      messageId,
      sessionId,
      category: 'reference',
      title: `Native Disassembly: ${funcName}`,
      sourceTool: toolCall.toolName,
      timestamp: toolCall.completedAt || toolCall.startedAt,
      location: {
        function: funcName,
        address: normalized.address ? String(normalized.address) : undefined,
      },
      snippet: {
        code: asm,
        language: 'asm',
        startLine: 1,
      },
    });
  }

  if (normalized.source || normalized.source_code || normalized.recovered_source) {
    const src = String(normalized.source || normalized.source_code || normalized.recovered_source);
    const filePath = String(normalized.file || normalized.path || normalized.source_path || 'source.js');
    items.push({
      id: `ev-${toolCall.id}-source`,
      toolCallId: toolCall.id,
      messageId,
      sessionId,
      category: 'reference',
      title: `Recovered Source: ${filePath}`,
      sourceTool: toolCall.toolName,
      timestamp: toolCall.completedAt || toolCall.startedAt,
      location: {
        file: filePath,
        line: typeof normalized.line === 'number' ? normalized.line : undefined,
      },
      snippet: {
        code: src,
        language: filePath.endsWith('.json') ? 'json' : 'javascript',
        startLine: 1,
      },
    });
  }

  // 5. Findings: Electron Security Fuses
  if (normalized.fuses && typeof normalized.fuses === 'object') {
    const fuses = normalized.fuses as Record<string, unknown>;
    for (const [fuseName, fuseVal] of Object.entries(fuses)) {
      items.push({
        id: `ev-${toolCall.id}-fuse-${fuseName}`,
        toolCallId: toolCall.id,
        messageId,
        sessionId,
        category: 'finding',
        title: `Security Fuse: ${fuseName} = ${String(fuseVal)}`,
        description: `Electron fuse configuration verified by ${toolCall.toolName}`,
        sourceTool: toolCall.toolName,
        timestamp: toolCall.completedAt || toolCall.startedAt,
        rawContent: { [fuseName]: fuseVal },
      });
    }
  }

  // 6. Findings: IPC Channels & Architecture
  if (Array.isArray(normalized.ipc_channels)) {
    for (let i = 0; i < normalized.ipc_channels.length; i++) {
      const ch = normalized.ipc_channels[i];
      const chName = typeof ch === 'string' ? ch : String((ch as Record<string, unknown>).name || (ch as Record<string, unknown>).channel);
      items.push({
        id: `ev-${toolCall.id}-ipc-${i}`,
        toolCallId: toolCall.id,
        messageId,
        sessionId,
        category: 'finding',
        title: `IPC Channel Identified: '${chName}'`,
        description: typeof ch === 'object' ? JSON.stringify(ch) : `Registered IPC channel`,
        sourceTool: toolCall.toolName,
        timestamp: toolCall.completedAt || toolCall.startedAt,
        location: {
          file: typeof ch === 'object' && 'file' in ch ? String(ch.file) : undefined,
        },
        rawContent: ch,
      });
    }
  }

  // 7. Findings: Binary overview / mitigations
  if (normalized.architecture || normalized.format || normalized.mitigations) {
    const parts = [
      normalized.format ? `Format: ${String(normalized.format)}` : null,
      normalized.architecture ? `Arch: ${String(normalized.architecture)}` : null,
      normalized.entry_point ? `Entry: ${String(normalized.entry_point)}` : null,
    ].filter(Boolean);

    items.push({
      id: `ev-${toolCall.id}-binary-overview`,
      toolCallId: toolCall.id,
      messageId,
      sessionId,
      category: 'finding',
      title: `Binary Layout: ${parts.join(' | ')}`,
      description: normalized.mitigations ? `Security Mitigations: ${JSON.stringify(normalized.mitigations)}` : undefined,
      sourceTool: toolCall.toolName,
      timestamp: toolCall.completedAt || toolCall.startedAt,
      location: {
        address: normalized.entry_point ? String(normalized.entry_point) : undefined,
      },
      rawContent: normalized,
    });
  }

  // 8. Findings: SQLite Tables
  if (Array.isArray(normalized.tables)) {
    for (let i = 0; i < normalized.tables.length; i++) {
      const tbl = normalized.tables[i];
      const tblName = typeof tbl === 'string' ? tbl : String((tbl as Record<string, unknown>).name || `Table ${i}`);
      items.push({
        id: `ev-${toolCall.id}-table-${i}`,
        toolCallId: toolCall.id,
        messageId,
        sessionId,
        category: 'finding',
        title: `Database Table: ${tblName}`,
        description: typeof tbl === 'object' && 'schema' in tbl ? String(tbl.schema) : undefined,
        sourceTool: toolCall.toolName,
        timestamp: toolCall.completedAt || toolCall.startedAt,
        rawContent: tbl,
      });
    }
  }

  // 9. If no specific domain items were parsed yet, treat as General Finding
  if (items.length === 0) {
    const title =
      typeof normalized.summary === 'string'
        ? normalized.summary
        : typeof normalized.name === 'string'
        ? `Artifact Finding: ${normalized.name}`
        : `Verified Finding from ${toolCall.toolName}`;

    items.push({
      id: `ev-${toolCall.id}-generic`,
      toolCallId: toolCall.id,
      messageId,
      sessionId,
      category: 'finding',
      title,
      sourceTool: toolCall.toolName,
      timestamp: toolCall.completedAt || toolCall.startedAt,
      location: {
        file: normalized.file ? String(normalized.file) : normalized.path ? String(normalized.path) : undefined,
        address: normalized.address ? String(normalized.address) : undefined,
        function: normalized.function ? String(normalized.function) : undefined,
        url: normalized.url ? String(normalized.url) : undefined,
      },
      snippet: {
        code: JSON.stringify(normalized, null, 2),
        language: 'json',
      },
      limitations: limitationsList.length > 0 ? limitationsList : undefined,
      rawContent: normalized,
    });
  }

  return items;
}

/**
 * Extracts and returns all EvidenceItems across an entire investigation session.
 */
export function extractSessionEvidence(session: Session): EvidenceItem[] {
  const allItems: EvidenceItem[] = [];

  for (const message of session.messages) {
    if (message.toolCalls && message.toolCalls.length > 0) {
      for (const tc of message.toolCalls) {
        const items = extractEvidenceFromToolCall(tc, session.id, message.id);
        allItems.push(...items);
      }
    }
  }

  return allItems;
}
