import { create } from 'zustand';
import type {
  Session,
  SessionMetadata,
  ChatMessage,
  ToolCall,
  ApprovalRequest,
  AppSettings,
} from '../../shared/ipc';

export type AgentRunState = 'idle' | 'thinking' | 'tool_running' | 'waiting_approval' | 'error';

interface AppState {
  // Sessions
  sessions: SessionMetadata[];
  activeSession: Session | null;
  isLoadingSession: boolean;

  // Run State & Streaming
  runState: AgentRunState;
  activeToolName: string | null;
  runError: string | null;
  isAgentThinking: boolean;
  streamingMessageId: string | null;
  streamingContent: string;

  // Pending approvals
  pendingApprovals: ApprovalRequest[];

  // Settings & System
  hasApiKey: boolean;
  isSettingsOpen: boolean;
  isOnboardingOpen: boolean;
  settings: AppSettings | null;
  systemInfo: {
    nodeVersion: string;
    platform: string;
    arch: string;
    electronVersion: string;
    reaVersion?: string;
    reaInstalled?: boolean;
  } | null;

  // Actions
  setSessions: (sessions: SessionMetadata[]) => void;
  setActiveSession: (session: Session | null) => void;
  setIsLoadingSession: (loading: boolean) => void;
  setRunState: (runState: AgentRunState, activeToolName?: string | null, error?: string | null) => void;
  appendMessage: (message: ChatMessage) => void;
  appendToken: (messageId: string, token: string) => void;
  completeStreamingMessage: () => void;
  upsertToolCall: (toolCall: ToolCall) => void;
  addApprovalRequest: (req: ApprovalRequest) => void;
  removeApprovalRequest: (approvalId: string) => void;
  setHasApiKey: (has: boolean) => void;
  setIsSettingsOpen: (open: boolean) => void;
  setIsOnboardingOpen: (open: boolean) => void;
  setSettings: (settings: AppSettings) => void;
  updateSettings: (partial: Partial<AppSettings>) => Promise<void>;
  setSystemInfo: (info: AppState['systemInfo']) => void;
  setIsAgentThinking: (thinking: boolean) => void;
  cancelRun: () => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  sessions: [],
  activeSession: null,
  isLoadingSession: false,

  runState: 'idle',
  activeToolName: null,
  runError: null,
  isAgentThinking: false,
  streamingMessageId: null,
  streamingContent: '',

  pendingApprovals: [],

  hasApiKey: false,
  isSettingsOpen: false,
  isOnboardingOpen: false,
  settings: null,
  systemInfo: null,

  setSessions: (sessions) => set({ sessions }),
  setActiveSession: (activeSession) => set({ activeSession }),
  setIsLoadingSession: (isLoadingSession) => set({ isLoadingSession }),

  setRunState: (runState, activeToolName = null, runError = null) =>
    set({
      runState,
      activeToolName: activeToolName ?? (runState === 'tool_running' ? get().activeToolName : null),
      runError: runError !== undefined ? runError : get().runError,
      isAgentThinking: runState === 'thinking' || runState === 'tool_running' || runState === 'waiting_approval',
    }),

  appendMessage: (message) =>
    set((state) => {
      if (!state.activeSession || state.activeSession.id !== message.sessionId) {
        return state;
      }
      const existingIdx = state.activeSession.messages.findIndex((m) => m.id === message.id);
      const updatedMessages = [...state.activeSession.messages];
      if (existingIdx >= 0) {
        updatedMessages[existingIdx] = message;
      } else {
        updatedMessages.push(message);
      }
      return {
        activeSession: {
          ...state.activeSession,
          messages: updatedMessages,
        },
      };
    }),

  appendToken: (messageId, token) =>
    set((state) => {
      if (state.streamingMessageId !== messageId) {
        return {
          streamingMessageId: messageId,
          streamingContent: token,
          runState: 'thinking',
          isAgentThinking: true,
        };
      }
      return {
        streamingContent: state.streamingContent + token,
        runState: 'thinking',
        isAgentThinking: true,
      };
    }),

  completeStreamingMessage: () =>
    set((state) => {
      let updatedSession = state.activeSession;
      if (state.streamingContent && state.activeSession) {
        const lastMsg = state.activeSession.messages[state.activeSession.messages.length - 1];
        if (lastMsg && lastMsg.role === 'agent' && !lastMsg.content) {
          const updatedMessages = [...state.activeSession.messages];
          updatedMessages[updatedMessages.length - 1] = {
            ...lastMsg,
            content: state.streamingContent,
          };
          updatedSession = { ...state.activeSession, messages: updatedMessages };
        }
      }
      return {
        activeSession: updatedSession,
        streamingMessageId: null,
        streamingContent: '',
        runState: 'idle',
        isAgentThinking: false,
        activeToolName: null,
      };
    }),

  upsertToolCall: (toolCall) =>
    set((state) => {
      if (!state.activeSession) return state;
      let matched = false;
      const messages = state.activeSession.messages.map((msg) => {
        const calls = msg.toolCalls ? [...msg.toolCalls] : [];
        const idx = calls.findIndex((c) => c.id === toolCall.id);
        if (idx >= 0) {
          matched = true;
          calls[idx] = {
            ...calls[idx],
            ...toolCall,
            toolName: toolCall.toolName || calls[idx].toolName,
            input:
              toolCall.input && Object.keys(toolCall.input).length > 0
                ? toolCall.input
                : calls[idx].input,
            isRisky: toolCall.isRisky ?? calls[idx].isRisky,
            startedAt: calls[idx].startedAt || toolCall.startedAt,
            output: toolCall.output !== undefined ? toolCall.output : calls[idx].output,
            error: toolCall.error !== undefined ? toolCall.error : calls[idx].error,
          };
          return { ...msg, toolCalls: calls };
        }
        return msg;
      });

      // If not attached to an existing message, attach to latest agent message
      if (!matched) {
        const latestAgentMsg = [...messages].reverse().find((m) => m.role === 'agent');
        if (latestAgentMsg) {
          const calls = latestAgentMsg.toolCalls ? [...latestAgentMsg.toolCalls] : [];
          if (!calls.some((c) => c.id === toolCall.id)) {
            calls.push(toolCall);
            latestAgentMsg.toolCalls = calls;
          }
        } else {
          // If no agent message yet in this turn, create one to hold the tool call
          messages.push({
            id: `msg-${Date.now()}`,
            sessionId: state.activeSession.id,
            role: 'agent',
            content: '',
            timestamp: new Date().toISOString(),
            toolCalls: [toolCall],
          });
        }
      }

      const nextRunState =
        toolCall.status === 'running'
          ? 'tool_running'
          : toolCall.status === 'error'
          ? 'error'
          : state.runState === 'tool_running'
          ? 'thinking'
          : state.runState;

      return {
        activeSession: {
          ...state.activeSession,
          messages,
        },
        runState: nextRunState,
        activeToolName: toolCall.status === 'running' ? toolCall.toolName : state.activeToolName,
      };
    }),

  addApprovalRequest: (req) =>
    set((state) => ({
      pendingApprovals: [
        ...state.pendingApprovals.filter((p) => p.approvalId !== req.approvalId),
        req,
      ],
      runState: 'waiting_approval',
      isAgentThinking: true,
    })),

  removeApprovalRequest: (approvalId) =>
    set((state) => {
      const remaining = state.pendingApprovals.filter((p) => p.approvalId !== approvalId);
      return {
        pendingApprovals: remaining,
        runState: remaining.length > 0 ? 'waiting_approval' : 'thinking',
      };
    }),

  setHasApiKey: (hasApiKey) => set({ hasApiKey }),
  setIsSettingsOpen: (isSettingsOpen) => set({ isSettingsOpen }),
  setIsOnboardingOpen: (isOnboardingOpen) => set({ isOnboardingOpen }),
  setSettings: (settings) => set({ settings }),
  updateSettings: async (partial) => {
    try {
      if (window.api?.settings?.update) {
        const res = await window.api.settings.update(partial);
        if (res.ok) {
          set({ settings: res.data });
        }
      }
    } catch (err) {
      console.error('Failed to update settings:', err);
    }
  },
  setSystemInfo: (systemInfo) => set({ systemInfo }),
  setIsAgentThinking: (isAgentThinking) => set({ isAgentThinking }),

  cancelRun: async () => {
    try {
      if (window.api?.agent?.cancel) {
        await window.api.agent.cancel();
      }
    } catch (err) {
      console.error('Cancel agent failed:', err);
    } finally {
      set({
        runState: 'idle',
        isAgentThinking: false,
        activeToolName: null,
        streamingMessageId: null,
      });
    }
  },
}));

if (typeof window !== 'undefined') {
  (window as unknown as { __APP_STORE__?: typeof useAppStore }).__APP_STORE__ = useAppStore;
}
