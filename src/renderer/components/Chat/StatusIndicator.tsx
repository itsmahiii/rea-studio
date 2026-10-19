import React from 'react';
import { Loader2, ShieldAlert, AlertCircle, Sparkles, Terminal } from 'lucide-react';
import type { AgentRunState } from '../../store/appStore';
import { getToolFriendlyName } from '../../../shared/toolClassification';

interface StatusIndicatorProps {
  runState: AgentRunState;
  activeToolName?: string | null;
  error?: string | null;
}

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({
  runState,
  activeToolName,
  error,
}) => {
  if (runState === 'idle') return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center space-x-2 px-3 py-1.5 rounded-full text-xs font-medium border backdrop-blur shadow-sm select-none transition-all"
      data-testid={`run-state-${runState}`}
    >
      {runState === 'thinking' && (
        <div className="flex items-center space-x-2 text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 px-3 py-1 rounded-full">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
          <span>Agent is thinking...</span>
        </div>
      )}

      {runState === 'tool_running' && (
        <div className="flex items-center space-x-2 text-amber-300 bg-amber-500/10 border border-amber-500/20 px-3 py-1 rounded-full">
          <Terminal className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
          <span>Running tool:</span>
          <span className="font-mono font-semibold text-amber-200">
            {activeToolName ? getToolFriendlyName(activeToolName) : 'REA Tool'}
          </span>
        </div>
      )}

      {runState === 'waiting_approval' && (
        <div className="flex items-center space-x-2 text-amber-400 bg-amber-500/15 border border-amber-500/30 px-3 py-1 rounded-full animate-pulse">
          <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
          <span>Waiting for risky action approval...</span>
        </div>
      )}

      {runState === 'error' && (
        <div className="flex items-center space-x-2 text-rose-300 bg-rose-500/10 border border-rose-500/20 px-3 py-1 rounded-full">
          <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
          <span>Agent error: {error || 'An unexpected error occurred'}</span>
        </div>
      )}
    </div>
  );
};
