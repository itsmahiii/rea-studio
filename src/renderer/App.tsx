import React, { useEffect } from 'react';
import { useAppStore } from './store/appStore';
import { TargetsPane } from './components/TargetsPane';
import { ChatPane } from './components/ChatPane';
import { InspectorPane } from './components/InspectorPane';
import { SettingsModal } from './components/SettingsModal';
import { FirstRunWizard } from './components/Onboarding/FirstRunWizard';

export const App: React.FC = () => {
  const {
    setSessions,
    setActiveSession,
    appendToken,
    appendMessage,
    completeStreamingMessage,
    upsertToolCall,
    addApprovalRequest,
    setHasApiKey,
    setSystemInfo,
    setIsAgentThinking,
    setRunState,
    setSettings,
    setIsOnboardingOpen,
  } = useAppStore();

  useEffect(() => {
    // 1. Load sessions list
    window.api.session.list().then((res) => {
      if (res.ok) {
        setSessions(res.data);
        if (res.data.length > 0) {
          window.api.session.get({ sessionId: res.data[0].id }).then((sRes) => {
            if (sRes.ok && sRes.data) {
              setActiveSession(sRes.data);
            }
          });
        }
      }
    });

    // 2. Check API key status
    window.api.apiKey.has().then((res) => {
      if (res.ok) {
        setHasApiKey(res.data.hasKey);
      }
    });

    // 3. Load system & REA info
    window.api.system.getInfo().then((res) => {
      if (res.ok) {
        setSystemInfo(res.data);
      }
    });

    // 4. Load application settings & check onboarding status
    window.api.settings.get().then((res) => {
      if (res.ok) {
        setSettings(res.data);
        if (!res.data.hasCompletedOnboarding) {
          setIsOnboardingOpen(true);
        }
      }
    });

    // 5. Attach typed IPC event listeners
    const unbindToken = window.api.on.agentToken((evt) => {
      appendToken(evt.messageId, evt.token);
    });

    const unbindMessage = window.api.on.agentMessage((msg) => {
      appendMessage(msg);
      completeStreamingMessage();
    });

    const unbindToolCall = window.api.on.agentToolCall((tc) => {
      upsertToolCall(tc);
    });

    const unbindApproval = window.api.on.approvalRequest((req) => {
      addApprovalRequest(req);
    });

    const unbindStatus = window.api.on.agentStatus((statusEvt) => {
      if (statusEvt.status === 'idle') {
        setRunState('idle');
      } else if (statusEvt.status === 'thinking') {
        setRunState('thinking');
      } else if (statusEvt.status === 'executing_tool') {
        setRunState('tool_running', statusEvt.activeTool);
      } else if (statusEvt.status === 'awaiting_approval') {
        setRunState('waiting_approval');
      } else if (statusEvt.status === 'error') {
        setRunState('error', null, statusEvt.error || 'An error occurred during agent run');
      }
      setIsAgentThinking(
        statusEvt.status === 'thinking' ||
          statusEvt.status === 'executing_tool' ||
          statusEvt.status === 'awaiting_approval',
      );
    });

    return () => {
      unbindToken();
      unbindMessage();
      unbindToolCall();
      unbindApproval();
      unbindStatus();
    };
  }, [
    setSessions,
    setActiveSession,
    appendToken,
    appendMessage,
    completeStreamingMessage,
    upsertToolCall,
    addApprovalRequest,
    setHasApiKey,
    setSystemInfo,
    setIsAgentThinking,
  ]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-950 font-sans text-slate-100">
      {/* 3-Pane Layout Shell */}
      <TargetsPane />
      <ChatPane />
      <InspectorPane />

      {/* Overlays */}
      <FirstRunWizard />
      <SettingsModal />
    </div>
  );
};

export default App;
