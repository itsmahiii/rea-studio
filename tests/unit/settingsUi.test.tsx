// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FirstRunWizard } from '../../src/renderer/components/Onboarding/FirstRunWizard';
import { SettingsModal } from '../../src/renderer/components/SettingsModal';
import { useAppStore } from '../../src/renderer/store/appStore';
import type { AppSettings } from '../../src/shared/ipc';

describe('Settings & Onboarding UI', () => {
  const mockSettings: AppSettings = {
    hasAcceptedLegal: false,
    hasCompletedOnboarding: false,
    selectedModel: 'claude-3-7-sonnet-20250219',
    customModel: '',
    nativeProvider: 'auto',
    reaCommandOverride: '',
    envOverrides: {
      REA_GHIDRA_STARTUP_TIMEOUT_MS: 60000,
      REA_HOPPER_STARTUP_TIMEOUT_MS: 30000,
      REA_JEB_MCP_URL: '',
      REA_MCP_MAX_RESPONSE_BYTES: 10485760,
    },
    analysisTimeoutSeconds: 120,
    theme: 'dark',
    userDataPath: 'C:/Users/test/AppData/Roaming/rea-studio',
  };

  beforeEach(() => {
    vi.restoreAllMocks();

    useAppStore.setState({
      isOnboardingOpen: true,
      isSettingsOpen: true,
      hasApiKey: true,
      settings: mockSettings,
      systemInfo: {
        nodeVersion: 'v24.21.0',
        platform: 'win32',
        arch: 'x64',
        electronVersion: '30.0.0',
        reaVersion: '6.7.0',
        reaInstalled: true,
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
        list: vi.fn().mockResolvedValue({ ok: true, data: [] }),
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
        set: vi.fn().mockResolvedValue({ ok: true, data: { success: true } }),
        has: vi.fn().mockResolvedValue({ ok: true, data: { hasKey: true } }),
        clear: vi.fn().mockResolvedValue({ ok: true, data: { success: true } }),
      },
      export: {
        saveReport: vi.fn(),
        saveSessionJson: vi.fn(),
      },
      system: {
        getInfo: vi.fn(),
        openExternal: vi.fn().mockResolvedValue({ ok: true, data: { success: true } }),
      },
      settings: {
        get: vi.fn().mockResolvedValue({ ok: true, data: mockSettings }),
        update: vi.fn().mockImplementation(async (partial) => ({
          ok: true,
          data: { ...mockSettings, ...partial },
        })),
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
        runUpdate: vi.fn().mockResolvedValue({
          ok: true,
          data: { success: true, output: 'Updated successfully.' },
        }),
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

  describe('FirstRunWizard Component', () => {
    it('disables the Continue button on Step 1 until legal checkbox is checked', () => {
      render(<FirstRunWizard />);

      expect(screen.getByText('Welcome to REA Studio')).toBeDefined();
      expect(screen.getByText('Important Legal & Authorization Notice')).toBeDefined();

      const nextBtn = screen.getByTestId('wizard-next-btn') as HTMLButtonElement;
      expect(nextBtn.disabled).toBe(true);

      const checkbox = screen.getByTestId('legal-checkbox');
      fireEvent.click(checkbox);

      expect(nextBtn.disabled).toBe(false);
    });

    it('advances through 4 steps and completes onboarding', async () => {
      render(<FirstRunWizard />);

      // Step 1 -> Check legal and click Continue
      fireEvent.click(screen.getByTestId('legal-checkbox'));
      fireEvent.click(screen.getByTestId('wizard-next-btn'));

      // Step 2: Model & API Key
      expect(screen.getByText('1. Model Selection')).toBeDefined();
      expect(screen.getByText('Claude 3.7 Sonnet')).toBeDefined();
      fireEvent.click(screen.getByTestId('wizard-next-btn'));

      // Step 3: Runtime & Tool Availability
      expect(screen.getByText('Node.js Runtime')).toBeDefined();
      expect(screen.getByText('REA CLI & MCP Engine')).toBeDefined();
      fireEvent.click(screen.getByTestId('wizard-next-btn'));

      // Step 4: Native Analysis Provider
      expect(screen.getByText('Default Native Analysis Provider')).toBeDefined();
      expect(screen.getByText('Auto-detect Provider')).toBeDefined();

      const finishBtn = screen.getByTestId('wizard-finish-btn');
      fireEvent.click(finishBtn);

      await waitFor(() => {
        expect(window.api.settings.update).toHaveBeenCalledWith(
          expect.objectContaining({
            hasAcceptedLegal: true,
            hasCompletedOnboarding: true,
          })
        );
      });
    });
  });

  describe('SettingsModal Component', () => {
    it('renders tabs and displays masked API key and delete option', () => {
      render(<SettingsModal />);

      expect(screen.getByText('REA Studio Settings')).toBeDefined();
      expect(screen.getByText('Active in Keychain')).toBeDefined();
      expect(screen.getByText('••••••••••••••••••••••••••••••••')).toBeDefined();
      expect(screen.getByTestId('clear-key-btn')).toBeDefined();
    });

    it('checks for updates in REA tab and displays command info', async () => {
      render(<SettingsModal />);

      fireEvent.click(screen.getByTestId('tab-rea'));

      expect(screen.getByText('REA Command Path Override')).toBeDefined();
      const checkUpdateBtn = screen.getByTestId('check-updates-btn');
      fireEvent.click(checkUpdateBtn);

      await waitFor(() => {
        expect(window.api.settings.checkUpdate).toHaveBeenCalled();
        expect(screen.getByText('npx -y rea-agents@latest --update')).toBeDefined();
      });
    });

    it('renders privacy disclosure panel stating local analysis and zero telemetry', () => {
      render(<SettingsModal />);

      fireEvent.click(screen.getByTestId('tab-privacy'));

      expect(screen.getByText('1. Analysis Runs 100% Locally')).toBeDefined();
      expect(screen.getByText('2. Model Context Transmission')).toBeDefined();
      expect(screen.getByText('3. OS Keychain Security')).toBeDefined();
      expect(screen.getByText('4. Zero Telemetry & Tracking')).toBeDefined();
    });

    it('prompts confirmation when clearing all local data', async () => {
      render(<SettingsModal />);

      fireEvent.click(screen.getByTestId('tab-general'));

      const clearAllBtn = screen.getByTestId('clear-all-data-btn');
      fireEvent.click(clearAllBtn);

      expect(screen.getByText('Confirm Permanent Reset')).toBeDefined();
      const confirmBtn = screen.getByTestId('confirm-clear-all-btn');
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(window.api.settings.clearAll).toHaveBeenCalledWith({ confirm: true });
      });
    });
  });
});
