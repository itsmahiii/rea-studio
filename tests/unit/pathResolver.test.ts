import { describe, it, expect } from 'vitest';
import {
  getCommonInstallDirs,
  getEnrichedPath,
  findExecutable,
  resolveReaMcpCommand,
} from '../../src/main/services/pathResolver';

describe('PathResolver Service', () => {
  it('returns common installation directories for Windows, macOS, and Linux', () => {
    const winDirs = getCommonInstallDirs('win32');
    expect(Array.isArray(winDirs)).toBe(true);

    const macDirs = getCommonInstallDirs('darwin');
    expect(Array.isArray(macDirs)).toBe(true);

    const linuxDirs = getCommonInstallDirs('linux');
    expect(Array.isArray(linuxDirs)).toBe(true);
  });

  it('enriches the PATH environment string', () => {
    const enriched = getEnrichedPath();
    expect(typeof enriched).toBe('string');
    expect(enriched.length).toBeGreaterThan(0);
    // Must contain process.env.PATH content if present
    if (process.env.PATH) {
      expect(enriched.length).toBeGreaterThanOrEqual(process.env.PATH.length);
    }
  });

  it('resolves REA command using configured override (Tier 1)', () => {
    const customCommand = 'custom-rea --debug';
    const resolved = resolveReaMcpCommand(customCommand);

    expect(resolved.command).toBe('custom-rea');
    expect(resolved.args).toEqual(['--debug']);
    expect(resolved.enrichedPath).toBeDefined();
  });

  it('resolves standard REA MCP execution command when available (Tier 2/3)', () => {
    const resolved = resolveReaMcpCommand();

    expect(resolved.enrichedPath).toBeDefined();
    expect(resolved.command).toBeDefined();
    expect(resolved.args).toBeDefined();
    expect(resolved.args.length).toBeGreaterThan(0);
  });

  it('finds node or npx on the current developer machine', () => {
    const isWin = process.platform === 'win32';
    const nodeBinary = isWin ? 'node.exe' : 'node';
    const found = findExecutable(nodeBinary);

    // Node is installed and running this vitest suite
    expect(found).not.toBeNull();
    expect(found?.toLowerCase()).toContain('node');
  });
});
