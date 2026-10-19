import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import {
  IPC_CHANNELS,
  type PickFileRequest,
  type PickFileResponse,
  type ValidateTargetRequest,
  type TargetInfo,
  type ListSessionsResponse,
  type CreateSessionRequest,
  type GetSessionRequest,
  type DeleteSessionRequest,
  type Session,
  type SendAgentMessageRequest,
  type SendAgentMessageResponse,
  type RespondApprovalRequest,
  type RespondApprovalResponse,
  type SetApiKeyRequest,
  type HasApiKeyRequest,
  type HasApiKeyResponse,
  type ClearApiKeyRequest,
  type ClearApiKeyResponse,
  type SaveReportRequest,
  type SaveReportResponse,
  type SaveSessionJsonRequest,
  type SaveSessionJsonResponse,
  type SystemInfoResponse,
  type StreamTokenEvent,
  type ChatMessage,
  type ToolCall,
  type ApprovalRequest,
  type AgentStatusEvent,
  type IpcResult,
  type GetTargetReadinessRequest,
  type GetTargetReadinessResponse,
  type AppSettings,
  type UpdateSettingsRequest,
  type ClearAllDataRequest,
  type ClearAllDataResponse,
  type CheckUpdateResponse,
  type RunUpdateRequest,
  type RunUpdateResponse,
} from '../shared/ipc';
import type { ElectronAPI } from '../shared/types';

function createListener<T>(channel: string) {
  return (callback: (payload: T) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, payload: T) => {
      callback(payload);
    };
    ipcRenderer.on(channel, handler);
    return () => {
      ipcRenderer.removeListener(channel, handler);
    };
  };
}

const api: ElectronAPI = {
  target: {
    pickFile: (req?: PickFileRequest): Promise<IpcResult<PickFileResponse>> =>
      ipcRenderer.invoke(IPC_CHANNELS.TARGET_PICK_FILE, req ?? {}),
    pickDirectory: (): Promise<IpcResult<PickFileResponse>> =>
      ipcRenderer.invoke(IPC_CHANNELS.TARGET_PICK_DIRECTORY, {}),
    validate: (req: ValidateTargetRequest): Promise<IpcResult<TargetInfo>> =>
      ipcRenderer.invoke(IPC_CHANNELS.TARGET_VALIDATE, req),
    getReadiness: (req: GetTargetReadinessRequest): Promise<IpcResult<GetTargetReadinessResponse>> =>
      ipcRenderer.invoke(IPC_CHANNELS.TARGET_READINESS, req),
  },

  session: {
    list: (): Promise<IpcResult<ListSessionsResponse>> =>
      ipcRenderer.invoke(IPC_CHANNELS.SESSION_LIST, {}),
    create: (req: CreateSessionRequest): Promise<IpcResult<Session>> =>
      ipcRenderer.invoke(IPC_CHANNELS.SESSION_CREATE, req),
    get: (req: GetSessionRequest): Promise<IpcResult<Session | null>> =>
      ipcRenderer.invoke(IPC_CHANNELS.SESSION_GET, req),
    delete: (req: DeleteSessionRequest): Promise<IpcResult<{ success: boolean }>> =>
      ipcRenderer.invoke(IPC_CHANNELS.SESSION_DELETE, req),
  },

  agent: {
    send: (req: SendAgentMessageRequest): Promise<IpcResult<SendAgentMessageResponse>> =>
      ipcRenderer.invoke(IPC_CHANNELS.AGENT_SEND, req),
    cancel: (): Promise<IpcResult<{ success: boolean }>> =>
      ipcRenderer.invoke(IPC_CHANNELS.AGENT_CANCEL, {}),
    respondApproval: (req: RespondApprovalRequest): Promise<IpcResult<RespondApprovalResponse>> =>
      ipcRenderer.invoke(IPC_CHANNELS.AGENT_RESPOND_APPROVAL, req),
  },

  apiKey: {
    set: (req: SetApiKeyRequest): Promise<IpcResult<{ success: boolean }>> =>
      ipcRenderer.invoke(IPC_CHANNELS.API_KEY_SET, req),
    has: (req?: HasApiKeyRequest): Promise<IpcResult<HasApiKeyResponse>> =>
      ipcRenderer.invoke(IPC_CHANNELS.API_KEY_HAS, req ?? {}),
    clear: (req?: ClearApiKeyRequest): Promise<IpcResult<ClearApiKeyResponse>> =>
      ipcRenderer.invoke(IPC_CHANNELS.API_KEY_CLEAR, req ?? {}),
  },

  export: {
    saveReport: (req: SaveReportRequest): Promise<IpcResult<SaveReportResponse>> =>
      ipcRenderer.invoke(IPC_CHANNELS.EXPORT_SAVE_REPORT, req),
    saveSessionJson: (req: SaveSessionJsonRequest): Promise<IpcResult<SaveSessionJsonResponse>> =>
      ipcRenderer.invoke(IPC_CHANNELS.EXPORT_SAVE_SESSION_JSON, req),
  },

  system: {
    getInfo: (): Promise<IpcResult<SystemInfoResponse>> =>
      ipcRenderer.invoke(IPC_CHANNELS.SYSTEM_INFO, {}),
    openExternal: (url: string): Promise<IpcResult<{ success: boolean }>> =>
      ipcRenderer.invoke(IPC_CHANNELS.SYSTEM_OPEN_EXTERNAL, { url }),
  },

  settings: {
    get: (): Promise<IpcResult<AppSettings>> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET, {}),
    update: (req: UpdateSettingsRequest): Promise<IpcResult<AppSettings>> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_UPDATE, req),
    clearAll: (req: ClearAllDataRequest): Promise<IpcResult<ClearAllDataResponse>> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_CLEAR_ALL, req),
    checkUpdate: (): Promise<IpcResult<CheckUpdateResponse>> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_CHECK_UPDATE, {}),
    runUpdate: (req: RunUpdateRequest): Promise<IpcResult<RunUpdateResponse>> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_RUN_UPDATE, req),
    openDataDir: (): Promise<IpcResult<{ success: boolean }>> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_OPEN_DATA_DIR, {}),
  },

  on: {
    agentToken: createListener<StreamTokenEvent>(IPC_CHANNELS.EVENT_AGENT_TOKEN),
    agentMessage: createListener<ChatMessage>(IPC_CHANNELS.EVENT_AGENT_MESSAGE),
    agentToolCall: createListener<ToolCall>(IPC_CHANNELS.EVENT_AGENT_TOOL_CALL),
    approvalRequest: createListener<ApprovalRequest>(IPC_CHANNELS.EVENT_AGENT_APPROVAL_REQUEST),
    agentStatus: createListener<AgentStatusEvent>(IPC_CHANNELS.EVENT_AGENT_STATUS),
  },
};

contextBridge.exposeInMainWorld('api', api);
