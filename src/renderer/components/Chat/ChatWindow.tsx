import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Send,
  Square,
  ArrowDown,
  Terminal,
  KeyRound,
  ShieldAlert,
  Bot,
} from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { MessageBubble } from './MessageBubble';
import { PermissionCard } from './PermissionCard';
import { StarterChips } from './StarterChips';
import { StatusIndicator } from './StatusIndicator';
import { CodeBlock } from './CodeBlock';

export const ChatWindow: React.FC = () => {
  const {
    activeSession,
    runState,
    activeToolName,
    runError,
    streamingContent,
    pendingApprovals,
    hasApiKey,
    removeApprovalRequest,
    setIsSettingsOpen,
    cancelRun,
  } = useAppStore();

  const [inputPrompt, setInputPrompt] = useState('');
  const [isUserScrolledUp, setIsUserScrolledUp] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isRunning = runState === 'thinking' || runState === 'tool_running' || runState === 'waiting_approval';
  const isComposerDisabled = !activeSession || !hasApiKey || isRunning;

  // Auto-scroll logic respecting user scroll position
  const scrollToBottom = useCallback((smooth = true) => {
    messagesEndRef.current?.scrollIntoView({
      behavior: smooth ? 'smooth' : 'auto',
    });
    setIsUserScrolledUp(false);
  }, []);

  useEffect(() => {
    if (!isUserScrolledUp) {
      scrollToBottom(false);
    }
  }, [
    activeSession?.messages,
    streamingContent,
    pendingApprovals,
    isUserScrolledUp,
    scrollToBottom,
  ]);

  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    setIsUserScrolledUp(distanceFromBottom > 80);
  };

  const handleSendMessage = async (textToSend?: string) => {
    const content = (textToSend || inputPrompt).trim();
    if (!content || !activeSession || isRunning || !hasApiKey) return;

    setInputPrompt('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    try {
      await window.api.agent.send({
        sessionId: activeSession.id,
        content,
      });
    } catch (err) {
      console.error('Failed to send message:', err);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleTextareaInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputPrompt(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 180)}px`;
  };

  const handleApprove = async (approvalId: string, approved: boolean) => {
    try {
      await window.api.agent.respondApproval({
        approvalId,
        approved,
      });
      removeApprovalRequest(approvalId);
    } catch (err) {
      console.error('Failed to respond to approval:', err);
    }
  };

  // If no target selected
  if (!activeSession) {
    return (
      <main
        className="flex-1 flex flex-col items-center justify-center bg-slate-950 p-8 text-center select-none"
        data-testid="no-target-view"
      >
        <div className="w-16 h-16 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-500 mb-4 shadow-xl">
          <Terminal className="w-8 h-8 text-indigo-400" />
        </div>
        <h2 className="text-lg font-semibold text-white">No Target Active</h2>
        <p className="text-sm text-slate-400 max-w-sm mt-1 leading-relaxed">
          Select or drag an app folder, ASAR archive, APK, or native binary into the left pane to begin investigation.
        </p>
      </main>
    );
  }

  const hasUserOrAgentMessages =
    activeSession.messages &&
    activeSession.messages.some((m) => m.role === 'user' || m.role === 'agent');

  return (
    <main
      className="flex-1 flex flex-col bg-slate-950 h-full overflow-hidden relative"
      data-testid="chat-pane"
    >
      {/* Title Bar */}
      <header className="px-6 py-3.5 border-b border-slate-800/80 bg-slate-900/60 backdrop-blur flex items-center justify-between select-none z-10">
        <div className="flex items-center space-x-3 min-w-0">
          <div
            className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
              isRunning ? 'bg-amber-400 animate-pulse' : 'bg-emerald-500'
            }`}
          />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-100 flex items-center space-x-2 truncate">
              <span className="truncate">{activeSession.target.name}</span>
              <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-indigo-300 flex-shrink-0">
                {activeSession.target.targetType}
              </span>
            </h2>
            <p className="text-[11px] text-slate-400 truncate max-w-lg mt-0.5 font-mono">
              {activeSession.target.path}
            </p>
          </div>
        </div>

        {/* Status Indicator */}
        <div className="flex items-center space-x-3">
          <StatusIndicator
            runState={runState}
            activeToolName={activeToolName}
            error={runError}
          />
        </div>
      </header>

      {/* Messages Timeline */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-6 py-4 space-y-2 relative"
        data-testid="messages-container"
        tabIndex={0}
        aria-label="Chat messages history"
      >
        {/* Starter Prompts when session has no conversational turns yet */}
        {!hasUserOrAgentMessages && !streamingContent && (
          <div className="max-w-2xl mx-auto py-8">
            <div className="text-center mb-6">
              <div className="inline-flex p-3 rounded-2xl bg-indigo-950/40 border border-indigo-500/30 text-indigo-400 mb-3 shadow-lg">
                <Bot className="w-8 h-8" />
              </div>
              <h3 className="text-base font-semibold text-slate-100">
                Ready to investigate {activeSession.target.name}
              </h3>
              <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                Ask questions about internal architecture, trace features to evidence, or pick a suggested starter below.
              </p>
            </div>

            <StarterChips
              targetType={activeSession.target.targetType}
              targetName={activeSession.target.name}
              onSelectPrompt={(p) => {
                setInputPrompt(p);
                textareaRef.current?.focus();
              }}
            />
          </div>
        )}

        {/* Existing Messages */}
        {activeSession.messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}

        {/* Streaming Token Message */}
        {streamingContent && (
          <div
            className="flex items-start space-x-3 my-4"
            data-testid="streaming-message"
          >
            <div className="w-7 h-7 rounded-lg bg-slate-800 border border-slate-700 text-indigo-400 flex items-center justify-center flex-shrink-0 shadow-sm">
              <Bot className="w-4 h-4" />
            </div>
            <div className="max-w-[85%] bg-slate-900 border border-slate-800 text-slate-200 p-4 rounded-2xl rounded-tl-none text-sm leading-relaxed shadow-md">
              <div className="prose prose-invert max-w-none text-slate-200 text-sm">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    code({ className, children, ...props }) {
                      const match = /language-(\w+)/.exec(className || '');
                      const codeText = String(children).replace(/\n$/, '');
                      if (match || codeText.includes('\n')) {
                        return (
                          <CodeBlock
                            language={match ? match[1] : 'text'}
                            value={codeText}
                          />
                        );
                      }
                      return (
                        <code
                          className="px-1.5 py-0.5 rounded bg-slate-800 text-indigo-300 font-mono text-xs"
                          {...props}
                        >
                          {children}
                        </code>
                      );
                    },
                  }}
                >
                  {streamingContent}
                </ReactMarkdown>
              </div>
              <span
                className="inline-block w-1.5 h-4 ml-1.5 bg-indigo-400 animate-pulse align-middle"
                data-testid="streaming-cursor"
              />
            </div>
          </div>
        )}

        {/* Inline Pending Approvals */}
        {pendingApprovals.map((req) => (
          <PermissionCard
            key={req.approvalId}
            request={req}
            onRespond={handleApprove}
          />
        ))}

        <div ref={messagesEndRef} className="h-4" />
      </div>

      {/* Floating Scroll-to-Bottom Button */}
      {isUserScrolledUp && (
        <button
          type="button"
          onClick={() => scrollToBottom(true)}
          aria-label="Scroll to newest messages"
          className="absolute bottom-24 right-8 p-2.5 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white shadow-xl border border-indigo-400/30 transition-all flex items-center space-x-1.5 text-xs font-semibold z-20 animate-bounce"
        >
          <ArrowDown className="w-4 h-4" />
          <span>New messages</span>
        </button>
      )}

      {/* Composer Section */}
      <footer className="p-4 border-t border-slate-800/80 bg-slate-900/70 backdrop-blur select-none">
        {/* Missing API Key Banner */}
        {!hasApiKey && (
          <div
            className="mb-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-between"
            data-testid="missing-api-key-banner"
          >
            <div className="flex items-center space-x-2 text-xs text-amber-300">
              <KeyRound className="w-4 h-4 text-amber-400 flex-shrink-0" />
              <span>Anthropic API key required to converse with the agent.</span>
            </div>
            <button
              type="button"
              onClick={() => setIsSettingsOpen(true)}
              className="px-3 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/30 text-xs font-semibold transition"
            >
              Configure API Key
            </button>
          </div>
        )}

        <div className="relative flex items-end rounded-2xl bg-slate-950 border border-slate-800 focus-within:border-indigo-500/80 transition-all shadow-inner">
          <textarea
            ref={textareaRef}
            rows={1}
            value={inputPrompt}
            onChange={handleTextareaInput}
            onKeyDown={handleKeyDown}
            disabled={isComposerDisabled}
            placeholder={
              !hasApiKey
                ? 'Please configure your Anthropic API key above to start chat...'
                : isRunning
                ? 'Agent is working... click Stop to cancel.'
                : 'Ask REA to decompile, map IPC, audit security fuses, or trace evidence... (Enter to send, Shift+Enter for newline)'
            }
            aria-label="Agent prompt input"
            className="w-full resize-none bg-transparent py-3.5 pl-4 pr-16 text-sm text-slate-100 placeholder-slate-500 focus:outline-none max-h-48 leading-relaxed font-sans disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="chat-composer-textarea"
          />

          <div className="absolute right-2.5 bottom-2.5 flex items-center space-x-1.5">
            {isRunning ? (
              <button
                type="button"
                onClick={cancelRun}
                aria-label="Stop running agent"
                className="p-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white shadow-md shadow-rose-600/20 transition flex items-center space-x-1 text-xs font-semibold"
                data-testid="stop-agent-btn"
              >
                <Square className="w-4 h-4 fill-current" />
                <span className="pr-1">Stop</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleSendMessage()}
                disabled={!inputPrompt.trim() || isComposerDisabled}
                aria-label="Send message"
                className="p-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:hover:bg-indigo-600 text-white shadow-md shadow-indigo-600/20 transition"
                data-testid="send-message-btn"
              >
                <Send className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between mt-2 px-1 text-[11px] text-slate-500">
          <span>Press <kbd className="px-1 py-0.5 rounded bg-slate-800 text-slate-400 font-mono text-[10px]">Enter</kbd> to send, <kbd className="px-1 py-0.5 rounded bg-slate-800 text-slate-400 font-mono text-[10px]">Shift+Enter</kbd> for newline</span>
          {activeSession && (
            <span className="font-mono">{activeSession.messages.length} messages</span>
          )}
        </div>
      </footer>
    </main>
  );
};
