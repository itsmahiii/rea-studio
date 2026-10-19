import { describe, it, expect } from 'vitest';
import { extractEvidenceFromToolCall, extractSessionEvidence } from '@/renderer/lib/evidenceParser';
import type { Session, ToolCall } from '@/shared/ipc';

describe('Evidence Parser (REA MCP Results Contract)', () => {
  const sessionId = 'test-session-1';

  it('extracts findings from inspect_electron_fuses output', () => {
    const tc: ToolCall = {
      id: 'tc-fuses-1',
      toolName: 'inspect_electron_fuses',
      input: { input_path: 'C:/apps/app.asar' },
      output: {
        structuredContent: {
          normalized_result: {
            fuses: {
              RunAsNode: false,
              EnableCookieEncryption: true,
              OnlyLoadAppFromAsar: true,
            },
          },
        },
      },
      status: 'success',
      isRisky: false,
      startedAt: '2026-10-18T12:00:00.000Z',
      completedAt: '2026-10-18T12:00:00.050Z',
    };

    const evidence = extractEvidenceFromToolCall(tc, sessionId);
    expect(evidence.length).toBe(3);
    expect(evidence[0].category).toBe('finding');
    expect(evidence[0].title).toContain('Security Fuse: RunAsNode = false');
    expect(evidence[1].title).toContain('Security Fuse: EnableCookieEncryption = true');
    expect(evidence[2].title).toContain('Security Fuse: OnlyLoadAppFromAsar = true');
  });

  it('extracts code reference with pseudocode snippet and function location', () => {
    const tc: ToolCall = {
      id: 'tc-decompile-1',
      toolName: 'procedure_pseudo_code',
      input: { address: '0x140001020' },
      output: {
        structuredContent: {
          normalized_result: {
            function_name: 'verify_license_signature',
            address: '0x140001020',
            pseudocode: 'int __fastcall verify_license_signature(char *key) {\n    if (!key) return 0;\n    return hash_check(key);\n}',
            facet_availability: {
              callers: { available: false, reason: 'Cross-reference index incomplete' },
            },
          },
          limitations: ['Indirect call targets unresolved'],
        },
      },
      status: 'success',
      isRisky: false,
      startedAt: '2026-10-18T12:01:00.000Z',
    };

    const evidence = extractEvidenceFromToolCall(tc, sessionId);
    // Should have: limitations item + facet limitation item + reference item
    const reference = evidence.find((e) => e.category === 'reference');
    expect(reference).toBeDefined();
    expect(reference?.title).toBe('Decompiled Pseudocode: verify_license_signature');
    expect(reference?.location?.address).toBe('0x140001020');
    expect(reference?.location?.function).toBe('verify_license_signature');
    expect(reference?.snippet?.language).toBe('c');
    expect(reference?.snippet?.code).toContain('hash_check(key)');

    const limitations = evidence.filter((e) => e.category === 'unknown_limitation');
    expect(limitations.length).toBe(2);
    expect(limitations.some((l) => l.description?.includes('Indirect call targets unresolved'))).toBe(true);
    expect(limitations.some((l) => l.title.includes('Unavailable Facet: callers'))).toBe(true);
  });

  it('extracts unknowns from record_unknown tool invocation', () => {
    const tc: ToolCall = {
      id: 'tc-unk-1',
      toolName: 'record_unknown',
      input: { question: 'What encryption algorithm is used for config payloads?' },
      output: {
        structuredContent: {
          normalized_result: {
            unknown_id: 'unk_01',
            question: 'What encryption algorithm is used for config payloads?',
            domain: 'cryptography',
            status: 'open',
          },
        },
      },
      status: 'success',
      isRisky: false,
      startedAt: '2026-10-18T12:02:00.000Z',
    };

    const evidence = extractEvidenceFromToolCall(tc, sessionId);
    expect(evidence.length).toBe(1);
    expect(evidence[0].category).toBe('unknown_limitation');
    expect(evidence[0].title).toBe('What encryption algorithm is used for config payloads?');
    expect(evidence[0].description).toContain('Domain: cryptography');
  });

  it('handles arbitrary unrecognized results as raw findings without fabricating fields', () => {
    const tc: ToolCall = {
      id: 'tc-custom-1',
      toolName: 'custom_rea_inspector',
      input: { query: 'test' },
      output: {
        unrecognized_complex_tree: { nested: 42, custom_field: 'abc' },
      },
      status: 'success',
      isRisky: false,
      startedAt: '2026-10-18T12:03:00.000Z',
    };

    const evidence = extractEvidenceFromToolCall(tc, sessionId);
    expect(evidence.length).toBe(1);
    expect(evidence[0].category).toBe('finding');
    expect(evidence[0].title).toContain('custom_rea_inspector');
    expect(evidence[0].snippet?.language).toBe('json');
    expect(evidence[0].rawContent).toBeDefined();
  });

  it('extracts evidence across full session messages', () => {
    const session: Session = {
      id: 'sess-full',
      title: 'Electron App Analysis',
      target: {
        path: 'C:/apps/my-app',
        name: 'my-app',
        isDirectory: true,
        targetType: 'javascript_electron',
        exists: true,
      },
      messages: [
        {
          id: 'msg-1',
          sessionId: 'sess-full',
          role: 'user',
          content: 'Audit the IPC channels in this Electron app.',
          timestamp: '2026-10-18T12:00:00.000Z',
        },
        {
          id: 'msg-2',
          sessionId: 'sess-full',
          role: 'agent',
          content: 'Here are the findings.',
          timestamp: '2026-10-18T12:00:05.000Z',
          toolCalls: [
            {
              id: 'tc-ipc-1',
              toolName: 'analyze_javascript_application',
              input: { input_path: 'C:/apps/my-app' },
              output: {
                structuredContent: {
                  normalized_result: {
                    ipc_channels: [
                      { name: 'auth:login', file: 'src/main/ipc.js' },
                      { name: 'vault:read', file: 'src/main/ipc.js' },
                    ],
                  },
                },
              },
              status: 'success',
              isRisky: false,
              startedAt: '2026-10-18T12:00:01.000Z',
            },
          ],
        },
      ],
      createdAt: '2026-10-18T12:00:00.000Z',
      updatedAt: '2026-10-18T12:00:05.000Z',
    };

    const evidence = extractSessionEvidence(session);
    expect(evidence.length).toBe(2);
    expect(evidence[0].title).toContain("IPC Channel Identified: 'auth:login'");
    expect(evidence[1].title).toContain("IPC Channel Identified: 'vault:read'");
  });
});
