// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TargetsPane } from '../../src/renderer/components/TargetsPane';
import { useAppStore } from '../../src/renderer/store/appStore';
import type { TargetInfo, TargetReadinessReport, Session } from '../../src/shared/ipc';

describe('TargetsPane Component & Pre-Flight UI', () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.setState({
      sessions: [],
      activeSession: null,
      isLoadingSession: false,
    });

    // Mock window.api
    window.api = {
      target: {
        pickFile: vi.fn().mockResolvedValue({
          ok: true,
          data: {
            path: 'C:/apps/my-electron-app/resources/app.asar',
            name: 'app.asar',
            isDirectory: false,
            targetType: 'javascript_electron',
            displayType: 'JavaScript/Electron',
            exists: true,
          } as TargetInfo,
        }),
        pickDirectory: vi.fn().mockResolvedValue({
          ok: true,
          data: {
            path: 'C:/apps/extracted-electron-app',
            name: 'extracted-electron-app',
            isDirectory: true,
            targetType: 'javascript_electron',
            displayType: 'JavaScript/Electron',
            exists: true,
          } as TargetInfo,
        }),
        validate: vi.fn().mockImplementation(async ({ path }: { path: string }) => {
          if (path.startsWith('http')) {
            return {
              ok: true,
              data: {
                path,
                name: path,
                isDirectory: false,
                targetType: 'url',
                displayType: 'Web Target / URL',
                exists: true,
              },
            };
          }
          if (path.endsWith('.exe')) {
            return {
              ok: true,
              data: {
                path,
                name: 'target.exe',
                isDirectory: false,
                targetType: 'native_pe',
                displayType: 'Windows PE Binary',
                exists: true,
              },
            };
          }
          return {
            ok: true,
            data: {
              path,
              name: 'extracted-electron-app',
              isDirectory: true,
              targetType: 'javascript_electron',
              displayType: 'JavaScript/Electron',
              exists: true,
            },
          };
        }),
        getReadiness: vi.fn().mockImplementation(async ({ targetType }: { targetType: string }) => {
          const isElectron = targetType === 'javascript_electron';
          return {
            ok: true,
            data: {
              targetType,
              isReady: true,
              source: 'best_effort',
              checks: [
                {
                  id: 'node-runtime',
                  name: 'Node.js Runtime',
                  description: 'Node.js 24.21.0 compatible',
                  passed: true,
                  status: 'passed',
                  detail: 'Node 24.21.0 found',
                },
                {
                  id: 'process-inspection',
                  name: 'Process Table Inspection',
                  description: 'tasklist.exe available',
                  passed: true,
                  status: 'passed',
                  detail: 'tasklist.exe found',
                },
                {
                  id: 'static-ast-engine',
                  name: 'Static JavaScript & AST Engine',
                  description: 'Built-in AST tools ready',
                  passed: true,
                  status: 'passed',
                  detail: 'REA built-in parser ready',
                },
              ],
            } as TargetReadinessReport,
          };
        }),
      },
      session: {
        list: vi.fn().mockResolvedValue({ ok: true, data: [] }),
        create: vi.fn().mockImplementation(async (req) => ({
          ok: true,
          data: {
            id: 'sess-new-1',
            title: `Analysis of ${req.targetName}`,
            target: {
              path: req.targetPath,
              name: req.targetName,
              isDirectory: false,
              targetType: req.targetType,
              exists: true,
            },
            provider: req.provider,
            messages: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          } as Session,
        })),
        get: vi.fn().mockResolvedValue({ ok: true, data: null }),
        delete: vi.fn().mockResolvedValue({ ok: true, data: { success: true } }),
      },
      agent: {
        send: vi.fn(),
        cancel: vi.fn(),
        respondApproval: vi.fn(),
      },
      apiKey: {
        set: vi.fn(),
        has: vi.fn().mockResolvedValue({ ok: true, data: { hasKey: true } }),
        clear: vi.fn(),
      },
      export: {
        saveReport: vi.fn(),
        saveSessionJson: vi.fn().mockResolvedValue({ ok: true, data: { savedPath: 'test.json' } }),
      },
      system: {
        getInfo: vi.fn(),
        openExternal: vi.fn().mockResolvedValue({ ok: true, data: { success: true } }),
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

  it('renders Targets pane shell with Add Target, Drag & Drop zone, and Open buttons', () => {
    render(<TargetsPane />);

    expect(screen.getByText('REA Studio')).toBeDefined();
    expect(screen.getByText('Add Target')).toBeDefined();
    expect(screen.getByText('Drag & drop target here')).toBeDefined();
    expect(screen.getByText('Open File')).toBeDefined();
    expect(screen.getByText('Open Folder')).toBeDefined();
    expect(screen.getByText('Paste URL')).toBeDefined();
  });

  it('detects extracted Electron app, displays "JavaScript/Electron" badge and readiness checklist', async () => {
    render(<TargetsPane />);

    // Click "Open Folder"
    const openFolderBtn = screen.getByText('Open Folder');
    fireEvent.click(openFolderBtn);

    // Wait for active target card to render
    await waitFor(() => {
      expect(screen.getByText('Active Target')).toBeDefined();
    });

    // Acceptance requirement: shows type "JavaScript/Electron"
    const badge = screen.getByTestId('target-type-badge');
    expect(badge.textContent).toBe('JavaScript/Electron');

    // Check pre-flight checklist
    expect(screen.getByText('Pre-Flight Readiness')).toBeDefined();
    await waitFor(() => {
      expect(screen.getByText('READY')).toBeDefined();
      expect(screen.getByText('Node.js Runtime')).toBeDefined();
      expect(screen.getByText('Process Table Inspection')).toBeDefined();
    });
  });

  it('allows user to override the detected type and updates readiness accordingly', async () => {
    render(<TargetsPane />);

    fireEvent.click(screen.getByText('Open Folder'));

    await waitFor(() => {
      expect(screen.getByText('Target Type Override')).toBeDefined();
    });

    const select = screen.getByTestId('type-override-select') as HTMLSelectElement;
    expect(select.value).toBe('javascript_electron');

    // Override to Android APK
    fireEvent.change(select, { target: { value: 'android_apk' } });

    await waitFor(() => {
      expect(window.api.target.getReadiness).toHaveBeenCalledWith(
        expect.objectContaining({ targetType: 'android_apk' })
      );
    });
  });

  it('displays native provider selector for native binary and persists choice', async () => {
    render(<TargetsPane />);

    // Simulate drag & drop of a native PE binary
    const dropZone = screen.getByText('Drag & drop target here').closest('div')!;
    fireEvent.drop(dropZone, {
      dataTransfer: {
        files: [{ path: 'C:/target.exe', name: 'target.exe' }],
      },
    });

    await waitFor(() => {
      expect(screen.getByText('Decompiler Provider')).toBeDefined();
    });

    const providerSelect = screen.getByTestId('provider-select') as HTMLSelectElement;
    expect(providerSelect).toBeDefined();

    // Change to Ghidra
    fireEvent.change(providerSelect, { target: { value: 'ghidra' } });
    expect(localStorage.getItem('rea_native_provider')).toBe('ghidra');
  });

  it('clicking "Start Investigation" creates a session with target context and switches to it', async () => {
    render(<TargetsPane />);

    fireEvent.click(screen.getByText('Open Folder'));

    await waitFor(() => {
      expect(screen.getByTestId('start-investigation-btn')).toBeDefined();
    });

    const startBtn = screen.getByTestId('start-investigation-btn');
    fireEvent.click(startBtn);

    await waitFor(() => {
      expect(window.api.session.create).toHaveBeenCalledWith(
        expect.objectContaining({
          targetPath: 'C:/apps/extracted-electron-app',
          targetName: 'extracted-electron-app',
          targetType: 'javascript_electron',
        })
      );
    });

    // Active session in store should now be set
    expect(useAppStore.getState().activeSession?.id).toBe('sess-new-1');
  });

  it('allows adding URL target via "Paste URL" input', async () => {
    render(<TargetsPane />);

    fireEvent.click(screen.getByText('Paste URL'));
    const input = screen.getByPlaceholderText('https://example.com/target');
    fireEvent.change(input, { target: { value: 'https://github.com/morluto/rea' } });

    const loadBtn = screen.getByText('Load Web Target');
    fireEvent.click(loadBtn);

    await waitFor(() => {
      expect(screen.getByTestId('target-type-badge').textContent).toBe('Web Target / URL');
    });
  });
});
