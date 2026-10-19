import type {
  PickFileRequest,
  PickFileResponse,
  ValidateTargetRequest,
  TargetInfo,
  ListSessionsResponse,
  CreateSessionRequest,
  GetSessionRequest,
  DeleteSessionRequest,
  Session,
  SendAgentMessageRequest,
  SendAgentMessageResponse,
  RespondApprovalRequest,
  RespondApprovalResponse,
  SetApiKeyRequest,
  HasApiKeyResponse,
  ClearApiKeyResponse,
  SaveReportRequest,
  SaveReportResponse,
  SaveSessionJsonRequest,
  SaveSessionJsonResponse,
  SystemInfoResponse,
  StreamTokenEvent,
  ChatMessage,
  ToolCall,
  ApprovalRequest,
  AgentStatusEvent,
  IpcResult,
  GetTargetReadinessRequest,
  GetTargetReadinessResponse,
  AppSettings,
  UpdateSettingsRequest,
  ClearAllDataRequest,
  ClearAllDataResponse,
  CheckUpdateResponse,
  RunUpdateRequest,
  RunUpdateResponse,
} from './ipc';

export * from './ipc';

export interface ElectronAPI {
  target: {
    pickFile: (req?: PickFileRequest) => Promise<IpcResult<PickFileResponse>>;
    pickDirectory: () => Promise<IpcResult<PickFileResponse>>;
    validate: (req: ValidateTargetRequest) => Promise<IpcResult<TargetInfo>>;
    getReadiness: (req: GetTargetReadinessRequest) => Promise<IpcResult<GetTargetReadinessResponse>>;
  };
  session: {
    list: () => Promise<IpcResult<ListSessionsResponse>>;
    create: (req: CreateSessionRequest) => Promise<IpcResult<Session>>;
    get: (req: GetSessionRequest) => Promise<IpcResult<Session | null>>;
    delete: (req: DeleteSessionRequest) => Promise<IpcResult<{ success: boolean }>>;
  };
  agent: {
    send: (req: SendAgentMessageRequest) => Promise<IpcResult<SendAgentMessageResponse>>;
    cancel: () => Promise<IpcResult<{ success: boolean }>>;
    respondApproval: (req: RespondApprovalRequest) => Promise<IpcResult<RespondApprovalResponse>>;
  };
  apiKey: {
    set: (req: SetApiKeyRequest) => Promise<IpcResult<{ success: boolean }>>;
    has: () => Promise<IpcResult<HasApiKeyResponse>>;
    clear: () => Promise<IpcResult<ClearApiKeyResponse>>;
  };
  export: {
    saveReport: (req: SaveReportRequest) => Promise<IpcResult<SaveReportResponse>>;
    saveSessionJson: (req: SaveSessionJsonRequest) => Promise<IpcResult<SaveSessionJsonResponse>>;
  };
  system: {
    getInfo: () => Promise<IpcResult<SystemInfoResponse>>;
    openExternal: (url: string) => Promise<IpcResult<{ success: boolean }>>;
  };
  settings: {
    get: () => Promise<IpcResult<AppSettings>>;
    update: (req: UpdateSettingsRequest) => Promise<IpcResult<AppSettings>>;
    clearAll: (req: ClearAllDataRequest) => Promise<IpcResult<ClearAllDataResponse>>;
    checkUpdate: () => Promise<IpcResult<CheckUpdateResponse>>;
    runUpdate: (req: RunUpdateRequest) => Promise<IpcResult<RunUpdateResponse>>;
    openDataDir: () => Promise<IpcResult<{ success: boolean }>>;
  };
  on: {
    agentToken: (cb: (event: StreamTokenEvent) => void) => () => void;
    agentMessage: (cb: (message: ChatMessage) => void) => () => void;
    agentToolCall: (cb: (toolCall: ToolCall) => void) => () => void;
    approvalRequest: (cb: (approval: ApprovalRequest) => void) => () => void;
    agentStatus: (cb: (status: AgentStatusEvent) => void) => () => void;
  };
}

declare global {
  interface Window {
    api: ElectronAPI;
  }
}
