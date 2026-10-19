import { ipcMain, BrowserWindow, dialog, shell } from 'electron';
import * as fs from 'fs';
import {
  IPC_CHANNELS,
  makeSuccess,
  makeError,
  PickFileRequestSchema,
  PickFileResponseSchema,
  PickDirectoryRequestSchema,
  ValidateTargetRequestSchema,
  TargetInfoSchema,
  ListSessionsRequestSchema,
  ListSessionsResponseSchema,
  CreateSessionRequestSchema,
  SessionSchema,
  GetSessionRequestSchema,
  DeleteSessionRequestSchema,
  SendAgentMessageRequestSchema,
  SendAgentMessageResponseSchema,
  RespondApprovalRequestSchema,
  RespondApprovalResponseSchema,
  CancelAgentRequestSchema,
  CancelAgentResponseSchema,
  SetApiKeyRequestSchema,
  HasApiKeyRequestSchema,
  HasApiKeyResponseSchema,
  ClearApiKeyRequestSchema,
  ClearApiKeyResponseSchema,
  SaveReportRequestSchema,
  SaveReportResponseSchema,
  SaveSessionJsonRequestSchema,
  SaveSessionJsonResponseSchema,
  SystemInfoRequestSchema,
  SystemInfoResponseSchema,
  OpenExternalRequestSchema,
  OpenExternalResponseSchema,
  GetTargetReadinessRequestSchema,
  GetTargetReadinessResponseSchema,
  GetSettingsRequestSchema,
  GetSettingsResponseSchema,
  UpdateSettingsRequestSchema,
  UpdateSettingsResponseSchema,
  ClearAllDataRequestSchema,
  ClearAllDataResponseSchema,
  CheckUpdateResponseSchema,
  RunUpdateRequestSchema,
  RunUpdateResponseSchema,
} from '../../shared/ipc';
import { targetService } from '../services/target';
import { sessionService } from '../services/session';
import { agentService } from '../services/agent';
import { readinessService } from '../services/readiness';
import { settingsService } from '../services/settings';
import { keychain } from '../keychain';

export function registerIpcHandlers(getMainWindow: () => BrowserWindow | null): void {
  // Wire AgentService event stream to Electron webContents
  agentService.onEvent((event) => {
    const win = getMainWindow();
    if (!win || win.isDestroyed()) return;

    switch (event.type) {
      case 'assistant_text_delta':
        win.webContents.send(IPC_CHANNELS.EVENT_AGENT_TOKEN, {
          sessionId: event.sessionId,
          messageId: 'active-turn',
          token: event.textDelta,
        });
        break;

      case 'tool_call_started':
        win.webContents.send(IPC_CHANNELS.EVENT_AGENT_TOOL_CALL, {
          id: event.toolCallId,
          toolName: event.toolName,
          input: event.input,
          status: 'running',
          isRisky: event.isRisky,
          startedAt: new Date().toISOString(),
        });
        break;

      case 'tool_call_result':
        win.webContents.send(IPC_CHANNELS.EVENT_AGENT_TOOL_CALL, {
          id: event.toolCallId,
          toolName: '',
          input: {},
          output: event.output,
          status: 'success',
          isRisky: false,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        });
        break;

      case 'tool_call_error':
        win.webContents.send(IPC_CHANNELS.EVENT_AGENT_TOOL_CALL, {
          id: event.toolCallId,
          toolName: '',
          input: {},
          error: event.error,
          status: 'error',
          isRisky: false,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        });
        break;

      case 'permission_request':
        win.webContents.send(IPC_CHANNELS.EVENT_AGENT_APPROVAL_REQUEST, {
          approvalId: event.approvalId,
          sessionId: event.sessionId,
          toolName: event.toolName,
          params: event.input,
          reason: event.description,
          requestedAt: new Date().toISOString(),
        });
        break;

      case 'run_finished':
        win.webContents.send(IPC_CHANNELS.EVENT_AGENT_STATUS, {
          sessionId: event.sessionId,
          status: 'idle',
        });
        break;

      case 'run_error':
        win.webContents.send(IPC_CHANNELS.EVENT_AGENT_STATUS, {
          sessionId: event.sessionId,
          status: 'error',
        });
        break;
    }
  });

  // -------------------------------------------------------------
  // Target Handlers
  // -------------------------------------------------------------
  ipcMain.handle(IPC_CHANNELS.TARGET_PICK_FILE, async (_event, rawReq) => {
    try {
      const parsed = PickFileRequestSchema.safeParse(rawReq);
      if (!parsed.success) {
        return makeError(`Invalid request: ${parsed.error.message}`);
      }
      const win = getMainWindow();
      const target = await targetService.pickFile(win ?? undefined, parsed.data.allowedExtensions);
      const validated = PickFileResponseSchema.parse(target);
      return makeSuccess(validated);
    } catch (err: unknown) {
      return makeError(err instanceof Error ? err.message : String(err));
    }
  });

  ipcMain.handle(IPC_CHANNELS.TARGET_PICK_DIRECTORY, async (_event, rawReq) => {
    try {
      const parsed = PickDirectoryRequestSchema.safeParse(rawReq);
      if (!parsed.success) {
        return makeError(`Invalid request: ${parsed.error.message}`);
      }
      const win = getMainWindow();
      const target = await targetService.pickDirectory(win ?? undefined);
      const validated = PickFileResponseSchema.parse(target);
      return makeSuccess(validated);
    } catch (err: unknown) {
      return makeError(err instanceof Error ? err.message : String(err));
    }
  });

  ipcMain.handle(IPC_CHANNELS.TARGET_VALIDATE, async (_event, rawReq) => {
    try {
      const parsed = ValidateTargetRequestSchema.safeParse(rawReq);
      if (!parsed.success) {
        return makeError(`Invalid request: ${parsed.error.message}`);
      }
      const info = targetService.validate(parsed.data.path);
      const validated = TargetInfoSchema.parse(info);
      return makeSuccess(validated);
    } catch (err: unknown) {
      return makeError(err instanceof Error ? err.message : String(err));
    }
  });

  ipcMain.handle(IPC_CHANNELS.TARGET_READINESS, async (_event, rawReq) => {
    try {
      const parsed = GetTargetReadinessRequestSchema.safeParse(rawReq);
      if (!parsed.success) {
        return makeError(`Invalid request: ${parsed.error.message}`);
      }
      const report = readinessService.getReadiness(parsed.data.targetType, parsed.data.targetPath);
      const validated = GetTargetReadinessResponseSchema.parse(report);
      return makeSuccess(validated);
    } catch (err: unknown) {
      return makeError(err instanceof Error ? err.message : String(err));
    }
  });

  // -------------------------------------------------------------
  // Session Handlers
  // -------------------------------------------------------------
  ipcMain.handle(IPC_CHANNELS.SESSION_LIST, async (_event, rawReq) => {
    try {
      const parsed = ListSessionsRequestSchema.safeParse(rawReq);
      if (!parsed.success) {
        return makeError(`Invalid request: ${parsed.error.message}`);
      }
      const list = sessionService.list();
      const validated = ListSessionsResponseSchema.parse(list);
      return makeSuccess(validated);
    } catch (err: unknown) {
      return makeError(err instanceof Error ? err.message : String(err));
    }
  });

  ipcMain.handle(IPC_CHANNELS.SESSION_CREATE, async (_event, rawReq) => {
    try {
      const parsed = CreateSessionRequestSchema.safeParse(rawReq);
      if (!parsed.success) {
        return makeError(`Invalid request: ${parsed.error.message}`);
      }
      const sessionId = await agentService.startSession({
        path: parsed.data.targetPath,
        name: parsed.data.targetName,
        targetType: parsed.data.targetType,
        provider: parsed.data.provider,
      });
      const session = sessionService.get(sessionId);
      const validated = SessionSchema.parse(session);
      return makeSuccess(validated);
    } catch (err: unknown) {
      return makeError(err instanceof Error ? err.message : String(err));
    }
  });

  ipcMain.handle(IPC_CHANNELS.SESSION_GET, async (_event, rawReq) => {
    try {
      const parsed = GetSessionRequestSchema.safeParse(rawReq);
      if (!parsed.success) {
        return makeError(`Invalid request: ${parsed.error.message}`);
      }
      await agentService.resume(parsed.data.sessionId);
      const session = sessionService.get(parsed.data.sessionId);
      const validated = session ? SessionSchema.parse(session) : null;
      return makeSuccess(validated);
    } catch (err: unknown) {
      return makeError(err instanceof Error ? err.message : String(err));
    }
  });

  ipcMain.handle(IPC_CHANNELS.SESSION_DELETE, async (_event, rawReq) => {
    try {
      const parsed = DeleteSessionRequestSchema.safeParse(rawReq);
      if (!parsed.success) {
        return makeError(`Invalid request: ${parsed.error.message}`);
      }
      const success = sessionService.delete(parsed.data.sessionId);
      return makeSuccess({ success });
    } catch (err: unknown) {
      return makeError(err instanceof Error ? err.message : String(err));
    }
  });

  // -------------------------------------------------------------
  // Agent Handlers
  // -------------------------------------------------------------
  ipcMain.handle(IPC_CHANNELS.AGENT_SEND, async (_event, rawReq) => {
    try {
      const parsed = SendAgentMessageRequestSchema.safeParse(rawReq);
      if (!parsed.success) {
        return makeError(`Invalid request: ${parsed.error.message}`);
      }
      // Trigger agent message asynchronously
      agentService.sendMessage(parsed.data.content).catch((err) => {
        console.error('Agent send failed:', err);
      });

      const validated = SendAgentMessageResponseSchema.parse({
        messageId: crypto.randomUUID(),
        received: true,
      });
      return makeSuccess(validated);
    } catch (err: unknown) {
      return makeError(err instanceof Error ? err.message : String(err));
    }
  });

  ipcMain.handle(IPC_CHANNELS.AGENT_RESPOND_APPROVAL, async (_event, rawReq) => {
    try {
      const parsed = RespondApprovalRequestSchema.safeParse(rawReq);
      if (!parsed.success) {
        return makeError(`Invalid request: ${parsed.error.message}`);
      }
      const resolved = agentService.respondPermission(parsed.data.approvalId, parsed.data.approved);
      if (!resolved) {
        return makeError(`Approval request ${parsed.data.approvalId} not found or expired.`);
      }
      const validated = RespondApprovalResponseSchema.parse({
        approvalId: parsed.data.approvalId,
        status: parsed.data.approved ? 'approved' : 'denied',
      });
      return makeSuccess(validated);
    } catch (err: unknown) {
      return makeError(err instanceof Error ? err.message : String(err));
    }
  });

  ipcMain.handle(IPC_CHANNELS.AGENT_CANCEL, async (_event, rawReq) => {
    try {
      const parsed = CancelAgentRequestSchema.safeParse(rawReq);
      if (!parsed.success) {
        return makeError(`Invalid request: ${parsed.error.message}`);
      }
      agentService.cancel();
      const validated = CancelAgentResponseSchema.parse({ success: true });
      return makeSuccess(validated);
    } catch (err: unknown) {
      return makeError(err instanceof Error ? err.message : String(err));
    }
  });

  // -------------------------------------------------------------
  // API Key Handlers
  // -------------------------------------------------------------
  ipcMain.handle(IPC_CHANNELS.API_KEY_SET, async (_event, rawReq) => {
    try {
      const parsed = SetApiKeyRequestSchema.safeParse(rawReq);
      if (!parsed.success) {
        return makeError(`Invalid request: ${parsed.error.message}`);
      }
      const provider = parsed.data.provider ?? settingsService.getSettings().modelProvider ?? 'anthropic';
      const success = keychain.setApiKey(parsed.data.key, provider);
      return makeSuccess({ success });
    } catch (err: unknown) {
      return makeError(err instanceof Error ? err.message : String(err));
    }
  });

  ipcMain.handle(IPC_CHANNELS.API_KEY_HAS, async (_event, rawReq) => {
    try {
      const parsed = HasApiKeyRequestSchema.safeParse(rawReq ?? {});
      if (!parsed.success) {
        return makeError(`Invalid request: ${parsed.error.message}`);
      }
      const provider = parsed.data.provider ?? settingsService.getSettings().modelProvider ?? 'anthropic';
      let hasKey = keychain.hasApiKey(provider);

      // Environment variable fallbacks
      if (!hasKey) {
        if (provider === 'anthropic' && process.env.ANTHROPIC_API_KEY) {
          hasKey = true;
        } else if (provider === 'openai' && process.env.OPENAI_API_KEY) {
          hasKey = true;
        } else if (provider === 'gemini' && (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)) {
          hasKey = true;
        } else if (provider === 'openrouter' && process.env.OPENROUTER_API_KEY) {
          hasKey = true;
        } else if (provider === 'ollama') {
          // Ollama does not require an API key for local usage
          hasKey = true;
        }
      }

      const validated = HasApiKeyResponseSchema.parse({ hasKey, provider });
      return makeSuccess(validated);
    } catch (err: unknown) {
      return makeError(err instanceof Error ? err.message : String(err));
    }
  });

  ipcMain.handle(IPC_CHANNELS.API_KEY_CLEAR, async (_event, rawReq) => {
    try {
      const parsed = ClearApiKeyRequestSchema.safeParse(rawReq ?? {});
      if (!parsed.success) {
        return makeError(`Invalid request: ${parsed.error.message}`);
      }
      const provider = parsed.data.provider;
      const success = keychain.clearApiKey(provider);
      return makeSuccess({ success });
    } catch (err: unknown) {
      return makeError(err instanceof Error ? err.message : String(err));
    }
  });

  // -------------------------------------------------------------
  // Export Handlers
  // -------------------------------------------------------------
  ipcMain.handle(IPC_CHANNELS.EXPORT_SAVE_REPORT, async (_event, rawReq) => {
    try {
      const parsed = SaveReportRequestSchema.safeParse(rawReq);
      if (!parsed.success) {
        return makeError(`Invalid request: ${parsed.error.message}`);
      }
      const win = getMainWindow();
      const result = await dialog.showSaveDialog(win ?? (null as unknown as BrowserWindow), {
        title: 'Export Findings Report',
        defaultPath: parsed.data.defaultFileName || `REA_Report_${Date.now()}.md`,
        filters: [{ name: 'Markdown Document', extensions: ['md'] }],
      });

      if (result.canceled || !result.filePath) {
        return makeSuccess({ savedPath: null });
      }

      fs.writeFileSync(result.filePath, parsed.data.markdown, 'utf-8');
      const validated = SaveReportResponseSchema.parse({ savedPath: result.filePath });
      return makeSuccess(validated);
    } catch (err: unknown) {
      return makeError(err instanceof Error ? err.message : String(err));
    }
  });

  ipcMain.handle(IPC_CHANNELS.EXPORT_SAVE_SESSION_JSON, async (_event, rawReq) => {
    try {
      const parsed = SaveSessionJsonRequestSchema.safeParse(rawReq);
      if (!parsed.success) {
        return makeError(`Invalid request: ${parsed.error.message}`);
      }
      const win = getMainWindow();
      const result = await dialog.showSaveDialog(win ?? (null as unknown as BrowserWindow), {
        title: 'Export Session Debug JSON',
        defaultPath: parsed.data.defaultFileName || `REA_Session_${parsed.data.sessionId}_${Date.now()}.json`,
        filters: [{ name: 'JSON Document', extensions: ['json'] }],
      });

      if (result.canceled || !result.filePath) {
        return makeSuccess({ savedPath: null });
      }

      fs.writeFileSync(result.filePath, parsed.data.jsonContent, 'utf-8');
      const validated = SaveSessionJsonResponseSchema.parse({ savedPath: result.filePath });
      return makeSuccess(validated);
    } catch (err: unknown) {
      return makeError(err instanceof Error ? err.message : String(err));
    }
  });

  // -------------------------------------------------------------
  // System Info Handlers
  // -------------------------------------------------------------
  ipcMain.handle(IPC_CHANNELS.SYSTEM_INFO, async (_event, rawReq) => {
    try {
      const parsed = SystemInfoRequestSchema.safeParse(rawReq);
      if (!parsed.success) {
        return makeError(`Invalid request: ${parsed.error.message}`);
      }
      const response = {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        electronVersion: process.versions.electron || 'unknown',
        reaVersion: '6.7.0',
        reaInstalled: true,
      };
      const validated = SystemInfoResponseSchema.parse(response);
      return makeSuccess(validated);
    } catch (err: unknown) {
      return makeError(err instanceof Error ? err.message : String(err));
    }
  });

  // -------------------------------------------------------------
  // System External Link Handlers
  // -------------------------------------------------------------
  ipcMain.handle(IPC_CHANNELS.SYSTEM_OPEN_EXTERNAL, async (_event, rawReq) => {
    try {
      const parsed = OpenExternalRequestSchema.safeParse(rawReq);
      if (!parsed.success) {
        return makeError(`Invalid request: ${parsed.error.message}`);
      }
      await shell.openExternal(parsed.data.url);
      const validated = OpenExternalResponseSchema.parse({ success: true });
      return makeSuccess(validated);
    } catch (err: unknown) {
      return makeError(err instanceof Error ? err.message : String(err));
    }
  });

  // -------------------------------------------------------------
  // Settings & Updates Handlers
  // -------------------------------------------------------------
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, async () => {
    try {
      const settings = settingsService.getSettings();
      const validated = GetSettingsResponseSchema.parse(settings);
      return makeSuccess(validated);
    } catch (err: unknown) {
      return makeError(err instanceof Error ? err.message : String(err));
    }
  });

  ipcMain.handle(IPC_CHANNELS.SETTINGS_UPDATE, async (_event, rawReq) => {
    try {
      const parsed = UpdateSettingsRequestSchema.safeParse(rawReq);
      if (!parsed.success) {
        return makeError(`Invalid settings update request: ${parsed.error.message}`);
      }
      const updated = settingsService.updateSettings(parsed.data);
      const validated = UpdateSettingsResponseSchema.parse(updated);
      return makeSuccess(validated);
    } catch (err: unknown) {
      return makeError(err instanceof Error ? err.message : String(err));
    }
  });

  ipcMain.handle(IPC_CHANNELS.SETTINGS_CLEAR_ALL, async (_event, rawReq) => {
    try {
      const parsed = ClearAllDataRequestSchema.safeParse(rawReq);
      if (!parsed.success || !parsed.data.confirm) {
        return makeError('Clear all data requires explicit user confirmation (confirm: true).');
      }
      const success = settingsService.clearAllLocalData();
      const validated = ClearAllDataResponseSchema.parse({ success });
      return makeSuccess(validated);
    } catch (err: unknown) {
      return makeError(err instanceof Error ? err.message : String(err));
    }
  });

  ipcMain.handle(IPC_CHANNELS.SETTINGS_CHECK_UPDATE, async () => {
    try {
      const result = await settingsService.checkForUpdates();
      const validated = CheckUpdateResponseSchema.parse(result);
      return makeSuccess(validated);
    } catch (err: unknown) {
      return makeError(err instanceof Error ? err.message : String(err));
    }
  });

  ipcMain.handle(IPC_CHANNELS.SETTINGS_RUN_UPDATE, async (_event, rawReq) => {
    try {
      const parsed = RunUpdateRequestSchema.safeParse(rawReq);
      if (!parsed.success) {
        return makeError(`Invalid update request: ${parsed.error.message}`);
      }
      const result = await settingsService.runUpdate(parsed.data.confirmed);
      const validated = RunUpdateResponseSchema.parse(result);
      return makeSuccess(validated);
    } catch (err: unknown) {
      return makeError(err instanceof Error ? err.message : String(err));
    }
  });

  ipcMain.handle(IPC_CHANNELS.SETTINGS_OPEN_DATA_DIR, async () => {
    try {
      const success = await settingsService.openDataDir();
      return makeSuccess({ success });
    } catch (err: unknown) {
      return makeError(err instanceof Error ? err.message : String(err));
    }
  });
}

