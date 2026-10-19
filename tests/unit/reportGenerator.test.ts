import { describe, it, expect } from 'vitest';
import { generateMarkdownReport } from '@/renderer/lib/reportGenerator';
import { extractSessionEvidence } from '@/renderer/lib/evidenceParser';
import type { Session } from '@/shared/ipc';

describe('Markdown Findings Report Generator with Snapshots', () => {
  const fixtureSession: Session = {
    id: 'session-fixture-42',
    title: 'Analysis of secure-vault.exe',
    target: {
      path: 'C:/targets/secure-vault.exe',
      name: 'secure-vault.exe',
      isDirectory: false,
      targetType: 'native_pe',
      size: 1048576,
      exists: true,
    },
    provider: 'ghidra',
    messages: [
      {
        id: 'msg-user-1',
        sessionId: 'session-fixture-42',
        role: 'user',
        content: 'Analyze the cryptographic initialization routine in this binary and verify if symbols are stripped.',
        timestamp: '2026-10-18T10:00:00.000Z',
      },
      {
        id: 'msg-agent-1',
        sessionId: 'session-fixture-42',
        role: 'agent',
        content: 'I will inspect the binary layout and decompile the initialization routine.',
        timestamp: '2026-10-18T10:00:02.000Z',
        toolCalls: [
          {
            id: 'tc-layout-1',
            toolName: 'binary_overview',
            input: {
              target_path: 'C:/targets/secure-vault.exe',
              api_key: 'sensitive-api-token-should-be-redacted',
            },
            output: {
              structuredContent: {
                normalized_result: {
                  format: 'PE32+',
                  architecture: 'x86_64',
                  entry_point: '0x140001000',
                  mitigations: {
                    aslr: true,
                    dep: true,
                    cfg: true,
                  },
                },
              },
            },
            status: 'success',
            isRisky: false,
            startedAt: '2026-10-18T10:00:03.000Z',
            completedAt: '2026-10-18T10:00:03.120Z',
          },
          {
            id: 'tc-pseudo-1',
            toolName: 'procedure_pseudo_code',
            input: {
              address: '0x140002040',
              provider: 'ghidra',
            },
            output: {
              structuredContent: {
                normalized_result: {
                  function_name: 'init_master_keyring',
                  address: '0x140002040',
                  pseudocode: `int __fastcall init_master_keyring(void *ctx) {\n    unsigned char seed[32];\n    if (!read_entropy(seed, 32)) return -1;\n    return aes_key_setup(ctx, seed);\n}`,
                },
                limitations: ['Static analysis unable to trace dynamic entropy source'],
              },
            },
            status: 'success',
            isRisky: false,
            startedAt: '2026-10-18T10:00:04.000Z',
            completedAt: '2026-10-18T10:00:04.450Z',
          },
          {
            id: 'tc-unknown-1',
            toolName: 'record_unknown',
            input: {
              question: 'Is the seed generated via BCryptGenRandom or hardware RNG?',
              domain: 'cryptography',
            },
            output: {
              structuredContent: {
                normalized_result: {
                  unknown_id: 'unk_crypto_01',
                  question: 'Is the seed generated via BCryptGenRandom or hardware RNG?',
                  domain: 'cryptography',
                  status: 'open',
                },
              },
            },
            status: 'success',
            isRisky: false,
            startedAt: '2026-10-18T10:00:05.000Z',
            completedAt: '2026-10-18T10:00:05.080Z',
          },
        ],
      },
    ],
    createdAt: '2026-10-18T10:00:00.000Z',
    updatedAt: '2026-10-18T10:00:05.000Z',
  };

  it('generates reproducible Markdown report matching snapshot', () => {
    const evidence = extractSessionEvidence(fixtureSession);
    const report = generateMarkdownReport(fixtureSession, evidence, {
      reaVersion: '6.7.0',
      nodeVersion: 'v24.22.0',
      platform: 'win32',
      arch: 'x64',
      provider: 'ghidra',
    });

    // 1. Verify key sections exist
    expect(report).toContain('# REA Studio Findings Report: secure-vault.exe');
    expect(report).toContain('## 1. Target Summary');
    expect(report).toContain('C:/targets/secure-vault.exe');
    expect(report).toContain('## 2. Environment & Configuration');
    expect(report).toContain('Analysis Provider:** ghidra');
    expect(report).toContain('## 3. Investigation Objectives & Questions Asked');
    expect(report).toContain('Analyze the cryptographic initialization routine');
    expect(report).toContain('## 4. Key Findings & Evidence');
    expect(report).toContain('Binary Layout: Format: PE32+ | Arch: x86_64 | Entry: 0x140001000');
    expect(report).toContain('## 5. References & Code Locations');
    expect(report).toContain('Decompiled Pseudocode: init_master_keyring');
    expect(report).toContain('aes_key_setup(ctx, seed)');
    expect(report).toContain('## 6. Unknowns & Analysis Limitations');
    expect(report).toContain('Is the seed generated via BCryptGenRandom or hardware RNG?');
    expect(report).toContain('## 7. Reproducibility & Audit Trail');

    // 2. Verify sensitive input parameter was redacted in reproducibility section
    expect(report).toContain('"api_key": "[REDACTED]"');
    expect(report).not.toContain('sensitive-api-token-should-be-redacted');

    // 3. Match snapshot
    // Remove dynamic timestamps to ensure 100% deterministic snapshot matching
    const normalizedReport = report.replace(/\*\*Generated:\*\* .+/g, '**Generated:** <TIMESTAMP>');
    expect(normalizedReport).toMatchSnapshot();
  });
});
