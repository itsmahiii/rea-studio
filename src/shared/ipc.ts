import { z } from 'zod';

/**
 * Standard discriminated union result format for all IPC handlers
 * as specified in AGENTS.md §6 Conventions:
 * { ok: true; data: T } | { ok: false; error: string }
 */
export type IpcResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export function makeSuccess<T>(data: T): IpcResult<T> {
  return { ok: true, data };
}

export function makeError<T = never>(error: string): IpcResult<T> {
  return { ok: false, error };
}

// -------------------------------------------------------------
// Schemas: Target
// -------------------------------------------------------------
export const PickFileRequestSchema = z.object({
  allowedExtensions: z.array(z.string()).optional(),
});
export type PickFileRequest = z.infer<typeof PickFileRequestSchema>;

export const TargetInfoSchema = z.object({
  path: z.string(),
  name: z.string(),
  isDirectory: z.boolean(),
  size: z.number().optional(),
  targetType: z.string(),
  exists: z.boolean(),
  detectedType: z.string().optional(),
  displayType: z.string().optional(),
});
export type TargetInfo = z.infer<typeof TargetInfoSchema>;

export const PickFileResponseSchema = TargetInfoSchema.nullable();
export type PickFileResponse = z.infer<typeof PickFileResponseSchema>;

export const PickDirectoryRequestSchema = z.object({});
export type PickDirectoryRequest = z.infer<typeof PickDirectoryRequestSchema>;

export const ValidateTargetRequestSchema = z.object({
  path: z.string(),
});
export type ValidateTargetRequest = z.infer<typeof ValidateTargetRequestSchema>;

// -------------------------------------------------------------
// Schemas: Target Readiness & Pre-flight
// -------------------------------------------------------------
export const ReadinessCheckItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  passed: z.boolean(),
  status: z.enum(['passed', 'failed', 'warning', 'optional']),
  detail: z.string().optional(),
  fixHint: z.string().optional(),
  docUrl: z.string().optional(),
});
export type ReadinessCheckItem = z.infer<typeof ReadinessCheckItemSchema>;

export const TargetReadinessReportSchema = z.object({
  targetType: z.string(),
  isReady: z.boolean(),
  source: z.enum(['rea_doctor', 'environment_probe', 'best_effort']),
  checks: z.array(ReadinessCheckItemSchema),
});
export type TargetReadinessReport = z.infer<typeof TargetReadinessReportSchema>;

export const GetTargetReadinessRequestSchema = z.object({
  targetType: z.string(),
  targetPath: z.string().optional(),
});
export type GetTargetReadinessRequest = z.infer<typeof GetTargetReadinessRequestSchema>;

export const GetTargetReadinessResponseSchema = TargetReadinessReportSchema;
export type GetTargetReadinessResponse = z.infer<typeof GetTargetReadinessResponseSchema>;


// -------------------------------------------------------------
// Schemas: Sessions
// -------------------------------------------------------------
export const SessionMetadataSchema = z.object({
  id: z.string(),
  title: z.string(),
  targetPath: z.string(),
  targetName: z.string(),
  targetType: z.string(),
  provider: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  messageCount: z.number(),
});
export type SessionMetadata = z.infer<typeof SessionMetadataSchema>;

export const ToolCallSchema = z.object({
  id: z.string(),
  toolName: z.string(),
  input: z.record(z.string(), z.unknown()),
  output: z.unknown().optional(),
  status: z.enum(['pending', 'running', 'success', 'error', 'awaiting_approval', 'denied']),
  isRisky: z.boolean(),
  error: z.string().optional(),
  startedAt: z.string(),
  completedAt: z.string().optional(),
});
export type ToolCall = z.infer<typeof ToolCallSchema>;

export const ChatMessageSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  role: z.enum(['user', 'agent', 'system']),
  content: z.string(),
  timestamp: z.string(),
  toolCalls: z.array(ToolCallSchema).optional(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const SessionSchema = z.object({
  id: z.string(),
  title: z.string(),
  target: TargetInfoSchema,
  provider: z.string().optional(),
  messages: z.array(ChatMessageSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Session = z.infer<typeof SessionSchema>;

export const ListSessionsRequestSchema = z.object({});
export const ListSessionsResponseSchema = z.array(SessionMetadataSchema);
export type ListSessionsResponse = z.infer<typeof ListSessionsResponseSchema>;

export const CreateSessionRequestSchema = z.object({
  targetPath: z.string(),
  targetName: z.string(),
  targetType: z.string().default('unknown'),
  provider: z.string().optional(),
});
export type CreateSessionRequest = z.infer<typeof CreateSessionRequestSchema>;

export const GetSessionRequestSchema = z.object({
  sessionId: z.string(),
});
export type GetSessionRequest = z.infer<typeof GetSessionRequestSchema>;

export const DeleteSessionRequestSchema = z.object({
  sessionId: z.string(),
});
export type DeleteSessionRequest = z.infer<typeof DeleteSessionRequestSchema>;

// -------------------------------------------------------------
// Schemas: Agent
// -------------------------------------------------------------
export const SendAgentMessageRequestSchema = z.object({
  sessionId: z.string(),
  content: z.string().min(1),
});
export type SendAgentMessageRequest = z.infer<typeof SendAgentMessageRequestSchema>;

export const SendAgentMessageResponseSchema = z.object({
  messageId: z.string(),
  received: z.boolean(),
});
export type SendAgentMessageResponse = z.infer<typeof SendAgentMessageResponseSchema>;

export const ApprovalRequestSchema = z.object({
  approvalId: z.string(),
  sessionId: z.string(),
  toolName: z.string(),
  params: z.record(z.string(), z.unknown()),
  reason: z.string(),
  requestedAt: z.string(),
});
export type ApprovalRequest = z.infer<typeof ApprovalRequestSchema>;

export const RespondApprovalRequestSchema = z.object({
  approvalId: z.string(),
  approved: z.boolean(),
});
export type RespondApprovalRequest = z.infer<typeof RespondApprovalRequestSchema>;

export const RespondApprovalResponseSchema = z.object({
  approvalId: z.string(),
  status: z.enum(['approved', 'denied']),
});
export type RespondApprovalResponse = z.infer<typeof RespondApprovalResponseSchema>;

// -------------------------------------------------------------
// Schemas: API Key
// -------------------------------------------------------------
// Schemas: API Key
// -------------------------------------------------------------
export const ModelProviderSchema = z.enum([
  'anthropic',
  'openai',
  'gemini',
  'openrouter',
  'ollama',
]);
export type ModelProvider = z.infer<typeof ModelProviderSchema>;

export const SetApiKeyRequestSchema = z.object({
  key: z.string().min(1),
  provider: ModelProviderSchema.optional(),
});
export type SetApiKeyRequest = z.infer<typeof SetApiKeyRequestSchema>;

export const HasApiKeyRequestSchema = z.object({
  provider: ModelProviderSchema.optional(),
});
export type HasApiKeyRequest = z.infer<typeof HasApiKeyRequestSchema>;

export const HasApiKeyResponseSchema = z.object({
  hasKey: z.boolean(),
  provider: ModelProviderSchema.optional(),
});
export type HasApiKeyResponse = z.infer<typeof HasApiKeyResponseSchema>;

export const ClearApiKeyRequestSchema = z.object({
  provider: ModelProviderSchema.optional(),
});
export type ClearApiKeyRequest = z.infer<typeof ClearApiKeyRequestSchema>;

export const ClearApiKeyResponseSchema = z.object({
  success: z.boolean(),
});
export type ClearApiKeyResponse = z.infer<typeof ClearApiKeyResponseSchema>;

// -------------------------------------------------------------
// Schemas: Report Export
// -------------------------------------------------------------
export const SaveReportRequestSchema = z.object({
  sessionId: z.string(),
  markdown: z.string(),
  defaultFileName: z.string().optional(),
});
export type SaveReportRequest = z.infer<typeof SaveReportRequestSchema>;

export const SaveReportResponseSchema = z.object({
  savedPath: z.string().nullable(),
});
export type SaveReportResponse = z.infer<typeof SaveReportResponseSchema>;

export const SaveSessionJsonRequestSchema = z.object({
  sessionId: z.string(),
  jsonContent: z.string(),
  defaultFileName: z.string().optional(),
});
export type SaveSessionJsonRequest = z.infer<typeof SaveSessionJsonRequestSchema>;

export const SaveSessionJsonResponseSchema = z.object({
  savedPath: z.string().nullable(),
});
export type SaveSessionJsonResponse = z.infer<typeof SaveSessionJsonResponseSchema>;

// -------------------------------------------------------------
// Schemas: System Info
// -------------------------------------------------------------
export const SystemInfoRequestSchema = z.object({});
export const SystemInfoResponseSchema = z.object({
  nodeVersion: z.string(),
  platform: z.string(),
  arch: z.string(),
  electronVersion: z.string(),
  reaVersion: z.string().optional(),
  reaInstalled: z.boolean(),
});
export type SystemInfoResponse = z.infer<typeof SystemInfoResponseSchema>;

// -------------------------------------------------------------
// Schemas: Settings & Onboarding
// -------------------------------------------------------------
export const AppSettingsSchema = z.object({
  hasAcceptedLegal: z.boolean(),
  hasCompletedOnboarding: z.boolean(),
  modelProvider: ModelProviderSchema.default('anthropic'),
  providerBaseUrl: z.string().optional(),
  selectedModel: z.string(),
  customModel: z.string(),
  nativeProvider: z.string(),
  reaCommandOverride: z.string(),
  envOverrides: z.object({
    REA_GHIDRA_STARTUP_TIMEOUT_MS: z.number().optional(),
    REA_HOPPER_STARTUP_TIMEOUT_MS: z.number().optional(),
    REA_JEB_MCP_URL: z.string().optional(),
    REA_MCP_MAX_RESPONSE_BYTES: z.number().optional(),
  }),
  analysisTimeoutSeconds: z.number(),
  theme: z.enum(['dark', 'light', 'system']),
  userDataPath: z.string().optional(),
});
export type AppSettings = z.infer<typeof AppSettingsSchema>;

export const GetSettingsRequestSchema = z.object({});
export const GetSettingsResponseSchema = AppSettingsSchema;
export type GetSettingsResponse = z.infer<typeof GetSettingsResponseSchema>;

export const UpdateSettingsRequestSchema = AppSettingsSchema.partial();
export type UpdateSettingsRequest = z.infer<typeof UpdateSettingsRequestSchema>;

export const UpdateSettingsResponseSchema = AppSettingsSchema;
export type UpdateSettingsResponse = z.infer<typeof UpdateSettingsResponseSchema>;

export const ClearAllDataRequestSchema = z.object({
  confirm: z.boolean(),
});
export type ClearAllDataRequest = z.infer<typeof ClearAllDataRequestSchema>;

export const ClearAllDataResponseSchema = z.object({
  success: z.boolean(),
});
export type ClearAllDataResponse = z.infer<typeof ClearAllDataResponseSchema>;

export const CheckUpdateResponseSchema = z.object({
  currentVersion: z.string(),
  latestVersion: z.string(),
  updateAvailable: z.boolean(),
  updateCommand: z.string(),
});
export type CheckUpdateResponse = z.infer<typeof CheckUpdateResponseSchema>;

export const RunUpdateRequestSchema = z.object({
  confirmed: z.boolean(),
});
export type RunUpdateRequest = z.infer<typeof RunUpdateRequestSchema>;

export const RunUpdateResponseSchema = z.object({
  success: z.boolean(),
  output: z.string(),
});
export type RunUpdateResponse = z.infer<typeof RunUpdateResponseSchema>;

// -------------------------------------------------------------
// Push Event Payloads
// -------------------------------------------------------------
export const StreamTokenEventSchema = z.object({
  sessionId: z.string(),
  messageId: z.string(),
  token: z.string(),
});
export type StreamTokenEvent = z.infer<typeof StreamTokenEventSchema>;

export const AgentStatusEventSchema = z.object({
  sessionId: z.string(),
  status: z.enum(['idle', 'thinking', 'executing_tool', 'awaiting_approval', 'error']),
  activeTool: z.string().optional(),
  error: z.string().optional(),
});
export type AgentStatusEvent = z.infer<typeof AgentStatusEventSchema>;

export const OpenExternalRequestSchema = z.object({
  url: z.string().refine((val) => {
    try {
      const parsed = new URL(val);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }, { message: 'Only secure HTTP and HTTPS web URLs may be opened externally.' }),
});
export type OpenExternalRequest = z.infer<typeof OpenExternalRequestSchema>;

export const OpenExternalResponseSchema = z.object({
  success: z.boolean(),
});
export type OpenExternalResponse = z.infer<typeof OpenExternalResponseSchema>;

export const CancelAgentRequestSchema = z.object({});
export type CancelAgentRequest = z.infer<typeof CancelAgentRequestSchema>;

export const CancelAgentResponseSchema = z.object({
  success: z.boolean(),
});
export type CancelAgentResponse = z.infer<typeof CancelAgentResponseSchema>;

// -------------------------------------------------------------
// IPC Channel Names
// -------------------------------------------------------------
export const IPC_CHANNELS = {
  // Target
  TARGET_PICK_FILE: 'target:pickFile',
  TARGET_PICK_DIRECTORY: 'target:pickDirectory',
  TARGET_VALIDATE: 'target:validate',
  TARGET_READINESS: 'target:readiness',

  // Session
  SESSION_LIST: 'session:list',
  SESSION_CREATE: 'session:create',
  SESSION_GET: 'session:get',
  SESSION_DELETE: 'session:delete',

  // Agent
  AGENT_SEND: 'agent:send',
  AGENT_CANCEL: 'agent:cancel',
  AGENT_RESPOND_APPROVAL: 'agent:respondApproval',

  // API Key
  API_KEY_SET: 'apiKey:set',
  API_KEY_HAS: 'apiKey:has',
  API_KEY_CLEAR: 'apiKey:clear',

  // Export
  EXPORT_SAVE_REPORT: 'export:saveReport',
  EXPORT_SAVE_SESSION_JSON: 'export:saveSessionJson',

  // System
  SYSTEM_INFO: 'system:info',
  SYSTEM_OPEN_EXTERNAL: 'system:openExternal',

  // Settings & Updates
  SETTINGS_GET: 'settings:get',
  SETTINGS_UPDATE: 'settings:update',
  SETTINGS_CLEAR_ALL: 'settings:clearAll',
  SETTINGS_CHECK_UPDATE: 'settings:checkUpdate',
  SETTINGS_RUN_UPDATE: 'settings:runUpdate',
  SETTINGS_OPEN_DATA_DIR: 'settings:openDataDir',

  // Push Events (Main -> Renderer)
  EVENT_AGENT_TOKEN: 'event:agentToken',
  EVENT_AGENT_MESSAGE: 'event:agentMessage',
  EVENT_AGENT_TOOL_CALL: 'event:agentToolCall',
  EVENT_AGENT_APPROVAL_REQUEST: 'event:agentApprovalRequest',
  EVENT_AGENT_STATUS: 'event:agentStatus',
} as const;
