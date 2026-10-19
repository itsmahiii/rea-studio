import type { Session } from '../../shared/ipc';
import type { EvidenceItem } from './evidenceParser';

export interface SystemEnvironmentInfo {
  reaVersion?: string;
  nodeVersion?: string;
  platform?: string;
  arch?: string;
  provider?: string;
}

/**
 * Sanitize input parameters to ensure sensitive tokens or keys are never exposed in reports.
 */
function sanitizeToolInputs(input: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(input)) {
    const lowerKey = key.toLowerCase();
    if (
      lowerKey.includes('key') ||
      lowerKey.includes('secret') ||
      lowerKey.includes('token') ||
      lowerKey.includes('password') ||
      lowerKey.includes('auth')
    ) {
      sanitized[key] = '[REDACTED]';
    } else if (val && typeof val === 'object' && !Array.isArray(val)) {
      sanitized[key] = sanitizeToolInputs(val as Record<string, unknown>);
    } else {
      sanitized[key] = val;
    }
  }
  return sanitized;
}

/**
 * Generate a comprehensive Markdown findings report adhering to REA Studio standards.
 */
export function generateMarkdownReport(
  session: Session,
  evidenceItems: EvidenceItem[],
  env?: SystemEnvironmentInfo
): string {
  const lines: string[] = [];

  // Title
  lines.push(`# REA Studio Findings Report: ${session.target.name}`);
  lines.push('');
  lines.push(`**Generated:** ${new Date().toISOString()}`);
  lines.push(`**Session ID:** \`${session.id}\``);
  lines.push('');
  lines.push('---');
  lines.push('');

  // 1. Target Summary
  lines.push('## 1. Target Summary');
  lines.push('');
  lines.push(`- **Target Name:** ${session.target.name}`);
  lines.push(`- **Absolute Path:** \`${session.target.path}\``);
  lines.push(`- **Target Classification:** \`${session.target.targetType}\``);
  if (session.target.size !== undefined) {
    const kb = (session.target.size / 1024).toFixed(1);
    lines.push(`- **Size:** ${session.target.size} bytes (${kb} KB)`);
  }
  lines.push(`- **Is Directory:** ${session.target.isDirectory ? 'Yes' : 'No'}`);
  lines.push('');

  // 2. Environment & Analysis Configuration
  lines.push('## 2. Environment & Configuration');
  lines.push('');
  lines.push(`- **REA MCP Server Version:** v${env?.reaVersion || '6.7.0'}`);
  lines.push(`- **Analysis Provider:** ${session.provider || env?.provider || 'auto'}`);
  lines.push(`- **Host Platform:** ${env?.platform || process.platform} (${env?.arch || process.arch})`);
  lines.push(`- **Host Node Runtime:** ${env?.nodeVersion || process.version}`);
  lines.push('');

  // 3. Questions Asked
  lines.push('## 3. Investigation Objectives & Questions Asked');
  lines.push('');
  const userMessages = session.messages.filter((m) => m.role === 'user');
  if (userMessages.length === 0) {
    lines.push('*No explicit user questions were submitted in this session.*');
  } else {
    for (let i = 0; i < userMessages.length; i++) {
      lines.push(`${i + 1}. ${userMessages[i].content.trim()}`);
    }
  }
  lines.push('');

  // 4. Findings with Evidence
  lines.push('## 4. Key Findings & Evidence');
  lines.push('');
  const findings = evidenceItems.filter((e) => e.category === 'finding');
  if (findings.length === 0) {
    lines.push('*No structured findings recorded yet.*');
  } else {
    for (const f of findings) {
      lines.push(`### ${f.title}`);
      lines.push(`- **Source Tool:** \`${f.sourceTool}\``);
      if (f.location) {
        const locParts: string[] = [];
        if (f.location.file) locParts.push(`File: \`${f.location.file}\``);
        if (f.location.function) locParts.push(`Function: \`${f.location.function}\``);
        if (f.location.address) locParts.push(`Address: \`${f.location.address}\``);
        if (f.location.offset) locParts.push(`Offset: \`${f.location.offset}\``);
        if (f.location.url) locParts.push(`URL: \`${f.location.url}\``);
        if (locParts.length > 0) {
          lines.push(`- **Location:** ${locParts.join(' | ')}`);
        }
      }
      if (f.description) {
        lines.push(`- **Details:** ${f.description}`);
      }
      if (f.confidenceNote) {
        lines.push(`- **Confidence Note:** ${f.confidenceNote}`);
      }
      if (f.snippet && f.snippet.code) {
        lines.push('');
        lines.push(`\`\`\`${f.snippet.language || ''}`);
        lines.push(f.snippet.code);
        lines.push('```');
      }
      lines.push('');
    }
  }

  // 5. References & Code Locations
  lines.push('## 5. References & Code Locations');
  lines.push('');
  const references = evidenceItems.filter((e) => e.category === 'reference');
  if (references.length === 0) {
    lines.push('*No decompiled references or source extracts recorded.*');
  } else {
    for (const ref of references) {
      lines.push(`### ${ref.title}`);
      lines.push(`- **Source Tool:** \`${ref.sourceTool}\``);
      if (ref.location) {
        const locs: string[] = [];
        if (ref.location.file) locs.push(`File: \`${ref.location.file}\``);
        if (ref.location.function) locs.push(`Function: \`${ref.location.function}\``);
        if (ref.location.address) locs.push(`Address: \`${ref.location.address}\``);
        if (locs.length > 0) lines.push(`- **Location:** ${locs.join(' | ')}`);
      }
      if (ref.snippet) {
        lines.push('');
        lines.push(`\`\`\`${ref.snippet.language || 'text'}`);
        lines.push(ref.snippet.code);
        lines.push('```');
      }
      lines.push('');
    }
  }

  // 6. Unknowns & Analysis Limitations
  lines.push('## 6. Unknowns & Analysis Limitations');
  lines.push('');
  const unknowns = evidenceItems.filter((e) => e.category === 'unknown_limitation');
  if (unknowns.length === 0) {
    lines.push('*No residual unknowns or tool limitations reported.*');
  } else {
    for (const unk of unknowns) {
      lines.push(`- **${unk.title}:** ${unk.description || 'Reported by ' + unk.sourceTool}`);
      if (unk.limitations && unk.limitations.length > 0) {
        for (const lim of unk.limitations) {
          lines.push(`  - Caveat: ${lim}`);
        }
      }
    }
  }
  lines.push('');

  // 7. Reproducibility & Audit Trail
  lines.push('## 7. Reproducibility & Audit Trail');
  lines.push('');
  lines.push('The following REA MCP tool invocations were executed during this investigation:');
  lines.push('');

  const toolCalls: { toolName: string; input: Record<string, unknown>; status: string }[] = [];
  for (const m of session.messages) {
    if (m.toolCalls) {
      for (const tc of m.toolCalls) {
        toolCalls.push({
          toolName: tc.toolName,
          input: sanitizeToolInputs(tc.input),
          status: tc.status,
        });
      }
    }
  }

  if (toolCalls.length === 0) {
    lines.push('*No tool calls recorded in this session.*');
  } else {
    for (let i = 0; i < toolCalls.length; i++) {
      const tc = toolCalls[i];
      lines.push(`### Step ${i + 1}: \`${tc.toolName}\``);
      lines.push(`- **Status:** \`${tc.status}\``);
      lines.push('- **Parameters:**');
      lines.push('```json');
      lines.push(JSON.stringify(tc.input, null, 2));
      lines.push('```');
      lines.push('');
    }
  }

  lines.push('---');
  lines.push(`*Report generated automatically by REA Studio*`);

  return lines.join('\n');
}
