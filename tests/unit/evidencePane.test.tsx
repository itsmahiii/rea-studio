// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EvidencePane } from '../../src/renderer/components/Evidence/EvidencePane';
import { useAppStore } from '../../src/renderer/store/appStore';
import type { Session } from '../../src/shared/ipc';

describe('EvidencePane Component', () => {
  const mockSession: Session = {
    id: 'sess-ui-test-1',
    title: 'Analysis of test-electron-app',
    target: {
      path: 'C:/apps/test-app',
      name: 'test-app',
      isDirectory: true,
      targetType: 'javascript_electron',
      size: 524288,
      exists: true,
    },
    provider: 'auto',
    messages: [
      {
        id: 'msg-u1',
        sessionId: 'sess-ui-test-1',
        role: 'user',
        content: 'Check the security fuses.',
        timestamp: '2026-10-18T10:00:00.000Z',
      },
      {
        id: 'msg-a1',
        sessionId: 'sess-ui-test-1',
        role: 'agent',
        content: 'Fuses analyzed.',
        timestamp: '2026-10-18T10:00:02.000Z',
        toolCalls: [
          {
            id: 'tc-f1',
            toolName: 'inspect_electron_fuses',
            input: { target: 'app' },
            output: {
              structuredContent: {
                normalized_result: {
                  fuses: {
                    RunAsNode: false,
                    EnableCookieEncryption: true,
                  },
                },
                limitations: ['Fuses only checked on main binary'],
              },
            },
            status: 'success',
            isRisky: false,
            startedAt: '2026-10-18T10:00:01.000Z',
          },
          {
            id: 'tc-ref1',
            toolName: 'recover_javascript_sources',
            input: { target: 'preload.js' },
            output: {
              structuredContent: {
                normalized_result: {
                  file: 'src/preload.js',
                  source: 'const { contextBridge, ipcRenderer } = require("electron");\ncontextBridge.exposeInMainWorld("api", {});',
                },
              },
            },
            status: 'success',
            isRisky: false,
            startedAt: '2026-10-18T10:00:02.000Z',
          },
        ],
      },
    ],
    createdAt: '2026-10-18T10:00:00.000Z',
    updatedAt: '2026-10-18T10:00:02.000Z',
  };

  beforeEach(() => {
    localStorage.clear();
    useAppStore.setState({
      activeSession: mockSession,
      systemInfo: {
        reaVersion: '6.7.0',
        nodeVersion: 'v24.22.0',
        platform: 'win32',
        arch: 'x64',
        electronVersion: '30.0.0',
      },
    });

    window.api = {
      target: {
        pickFile: vi.fn(),
        pickDirectory: vi.fn(),
        validate: vi.fn(),
        getReadiness: vi.fn(),
      },
      session: {
        list: vi.fn(),
        create: vi.fn(),
        get: vi.fn(),
        delete: vi.fn(),
      },
      agent: {
        send: vi.fn(),
        cancel: vi.fn(),
        respondApproval: vi.fn(),
      },
      apiKey: {
        set: vi.fn(),
        has: vi.fn(),
        clear: vi.fn(),
      },
      export: {
        saveReport: vi.fn().mockResolvedValue({ ok: true, data: { savedPath: 'C:/reports/findings.md' } }),
        saveSessionJson: vi.fn().mockResolvedValue({ ok: true, data: { savedPath: 'C:/reports/session.json' } }),
      },
      system: {
        getInfo: vi.fn(),
        openExternal: vi.fn(),
      },
      settings: {
        get: vi.fn().mockResolvedValue({
          ok: true,
          data: {
            hasAcceptedLegal: true,
            hasCompletedOnboarding: true,
            selectedModel: 'claude-3-7-sonnet-20250219',
            customModel: '',
            nativeProvider: 'auto',
            reaCommandOverride: '',
            envOverrides: {},
            analysisTimeoutSeconds: 120,
            theme: 'dark',
          },
        }),
        update: vi.fn().mockResolvedValue({ ok: true, data: {} }),
        clearAll: vi.fn().mockResolvedValue({ ok: true, data: { success: true } }),
        checkUpdate: vi.fn().mockResolvedValue({
          ok: true,
          data: {
            currentVersion: '6.7.0',
            latestVersion: '6.7.0',
            updateAvailable: false,
            updateCommand: 'npx -y rea-agents@latest --update',
          },
        }),
        runUpdate: vi.fn().mockResolvedValue({ ok: true, data: { success: true, output: 'Updated' } }),
        openDataDir: vi.fn().mockResolvedValue({ ok: true, data: { success: true } }),
      },
      on: {
        agentToken: vi.fn().mockReturnValue(() => {}),
        agentMessage: vi.fn().mockReturnValue(() => {}),
        agentToolCall: vi.fn().mockReturnValue(() => {}),
        approvalRequest: vi.fn().mockReturnValue(() => {}),
        agentStatus: vi.fn().mockReturnValue(() => {}),
      },
    };
  });

  it('renders EvidencePane with search input and group filter tabs', () => {
    render(<EvidencePane />);

    expect(screen.getByText('Evidence & Findings')).toBeDefined();
    expect(screen.getByTestId('evidence-search-input')).toBeDefined();
    expect(screen.getByText(/All \(\d+\)/)).toBeDefined();
    expect(screen.getByText(/Findings \(\d+\)/)).toBeDefined();
    expect(screen.getByText(/References \(\d+\)/)).toBeDefined();
    expect(screen.getByText(/Unknowns \(\d+\)/)).toBeDefined();
  });

  it('renders parsed findings, references, and limitations from session tool calls', () => {
    render(<EvidencePane />);

    // Fuses findings
    expect(screen.getByText('Security Fuse: RunAsNode = false')).toBeDefined();
    expect(screen.getByText('Security Fuse: EnableCookieEncryption = true')).toBeDefined();

    // Source reference
    expect(screen.getByText('Recovered Source: src/preload.js')).toBeDefined();

    // Limitations
    expect(screen.getByText('Analysis Limitations reported by inspect_electron_fuses')).toBeDefined();
  });

  it('filters items when clicking group tabs', () => {
    render(<EvidencePane />);

    // Click "References" tab
    const refsTab = screen.getByText(/References \(\d+\)/);
    fireEvent.click(refsTab);

    // Reference should be visible
    expect(screen.getByText('Recovered Source: src/preload.js')).toBeDefined();
    // Fuses finding should NOT be visible
    expect(screen.queryByText('Security Fuse: RunAsNode = false')).toBeNull();
  });

  it('dynamically filters items using the search input', () => {
    render(<EvidencePane />);

    const searchInput = screen.getByTestId('evidence-search-input');
    fireEvent.change(searchInput, { target: { value: 'CookieEncryption' } });

    expect(screen.getByText('Security Fuse: EnableCookieEncryption = true')).toBeDefined();
    expect(screen.queryByText('Security Fuse: RunAsNode = false')).toBeNull();
  });

  it('renders code snippet with line numbers and allows pinning an item', async () => {
    render(<EvidencePane />);

    // Check code snippet table has line numbers
    expect(screen.getByText('contextBridge.exposeInMainWorld("api", {});')).toBeDefined();
    expect(screen.getByText('1')).toBeDefined();
    expect(screen.getByText('2')).toBeDefined();

    // Pin the first item
    const pinButtons = screen.getAllByLabelText('Pin');
    expect(pinButtons.length).toBeGreaterThan(0);
    fireEvent.click(pinButtons[0]);

    // Pinned count tab should appear
    await waitFor(() => {
      expect(screen.getByLabelText('Unpin')).toBeDefined();
    });
  });

  it('calls export.saveReport when clicking "Export Report"', async () => {
    render(<EvidencePane />);

    const exportBtn = screen.getByTestId('export-markdown-btn');
    fireEvent.click(exportBtn);

    await waitFor(() => {
      expect(window.api.export.saveReport).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'sess-ui-test-1',
        })
      );
    });

    expect(screen.getByText('Report saved to C:/reports/findings.md')).toBeDefined();
  });

  it('calls export.saveSessionJson when clicking "Export JSON"', async () => {
    render(<EvidencePane />);

    const exportJsonBtn = screen.getByTestId('export-json-btn');
    fireEvent.click(exportJsonBtn);

    await waitFor(() => {
      expect(window.api.export.saveSessionJson).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'sess-ui-test-1',
        })
      );
    });

    expect(screen.getByText('Session JSON saved to C:/reports/session.json')).toBeDefined();
  });
});
