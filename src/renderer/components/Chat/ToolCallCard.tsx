import React, { useState, useEffect, useMemo } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Terminal,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FileCode,
  Shield,
  Zap,
} from 'lucide-react';
import type { ToolCall } from '../../../shared/ipc';
import {
  getToolFriendlyName,
  getToolBadgeClassification,
} from '../../../shared/toolClassification';

interface ToolCallCardProps {
  toolCall: ToolCall;
  initiallyExpanded?: boolean;
}

export const ToolCallCard: React.FC<ToolCallCardProps> = ({
  toolCall,
  initiallyExpanded = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(initiallyExpanded);
  const [showFullOutput, setShowFullOutput] = useState(false);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);

  const friendlyName = useMemo(
    () => getToolFriendlyName(toolCall.toolName),
    [toolCall.toolName],
  );

  const badgeClassification = useMemo(
    () => getToolBadgeClassification(toolCall.toolName, toolCall.isRisky),
    [toolCall.toolName, toolCall.isRisky],
  );

  // Live timer if running
  useEffect(() => {
    if (toolCall.status === 'running') {
      const startTime = new Date(toolCall.startedAt).getTime();
      const interval = setInterval(() => {
        setElapsedMs(Math.max(0, Date.now() - startTime));
      }, 100);
      return () => clearInterval(interval);
    } else if (toolCall.completedAt && toolCall.startedAt) {
      const start = new Date(toolCall.startedAt).getTime();
      const end = new Date(toolCall.completedAt).getTime();
      setElapsedMs(Math.max(0, end - start));
    }
  }, [toolCall.status, toolCall.startedAt, toolCall.completedAt]);

  const formattedTiming = useMemo(() => {
    if (elapsedMs === null) return null;
    if (elapsedMs < 1000) return `${elapsedMs}ms`;
    return `${(elapsedMs / 1000).toFixed(1)}s`;
  }, [elapsedMs]);

  // Output formatting and truncation check with safety limit against large 10MB outputs
  const MAX_OUTPUT_CHARS = 50_000;

  const { safeOutputText, isTruncatedByLength, totalCharCount } = useMemo(() => {
    if (toolCall.output === undefined || toolCall.output === null) {
      return { safeOutputText: null, isTruncatedByLength: false, totalCharCount: 0 };
    }
    const raw =
      typeof toolCall.output === 'string'
        ? toolCall.output
        : JSON.stringify(toolCall.output, null, 2);

    if (raw.length > MAX_OUTPUT_CHARS) {
      return {
        safeOutputText: raw.slice(0, MAX_OUTPUT_CHARS),
        isTruncatedByLength: true,
        totalCharCount: raw.length,
      };
    }
    return { safeOutputText: raw, isTruncatedByLength: false, totalCharCount: raw.length };
  }, [toolCall.output]);

  const outputLines = useMemo(() => {
    if (!safeOutputText) return [];
    return safeOutputText.split('\n');
  }, [safeOutputText]);

  const isOutputLong = outputLines.length > 12 || isTruncatedByLength;
  const displayedOutput = showFullOutput || (!isOutputLong && !isTruncatedByLength)
    ? safeOutputText + (isTruncatedByLength ? `\n\n[Output truncated: displaying first ${(MAX_OUTPUT_CHARS / 1024).toFixed(0)}KB of ${(totalCharCount / (1024 * 1024)).toFixed(1)}MB total payload to maintain UI responsiveness]` : '')
    : outputLines.slice(0, 12).join('\n') + `\n... (${outputLines.length - 12} more lines)`;

  return (
    <div
      id={`tool-call-${toolCall.id}`}
      className="my-2.5 rounded-xl border border-slate-800 bg-slate-900/85 overflow-hidden shadow-sm transition-all"
      data-testid={`tool-card-${toolCall.id}`}
    >
      {/* Header bar */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
        aria-label={`${friendlyName} tool call, status ${toolCall.status}`}
        className="w-full px-3.5 py-2.5 flex items-center justify-between text-left hover:bg-slate-800/40 select-none transition focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
      >
        <div className="flex items-center space-x-2.5 min-w-0">
          <div className="text-slate-400">
            {isExpanded ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </div>

          <div className="p-1 rounded bg-slate-800 border border-slate-700/80 text-indigo-400">
            <Terminal className="w-3.5 h-3.5" />
          </div>

          <div className="flex items-center space-x-2 truncate">
            <span className="font-medium text-xs text-slate-100 truncate">
              {friendlyName}
            </span>
            <span className="font-mono text-[11px] text-slate-500 truncate hidden sm:inline">
              ({toolCall.toolName})
            </span>
          </div>

          {/* Classification Badge: Static vs Runs target */}
          {badgeClassification === 'Runs target' ? (
            <span
              className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30"
              data-testid="badge-runs-target"
            >
              <Zap className="w-3 h-3 text-amber-400" />
              <span>Runs target</span>
            </span>
          ) : (
            <span
              className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-800 text-slate-300 border border-slate-700"
              data-testid="badge-static"
            >
              <Shield className="w-3 h-3 text-slate-400" />
              <span>Static</span>
            </span>
          )}
        </div>

        {/* Right side: Timing & Status */}
        <div className="flex items-center space-x-2 flex-shrink-0">
          {formattedTiming && (
            <span className="flex items-center space-x-1 text-[11px] font-mono text-slate-400">
              <Clock className="w-3 h-3 text-slate-500" />
              <span>{formattedTiming}</span>
            </span>
          )}

          {toolCall.status === 'running' && (
            <span
              className="flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-medium text-amber-400 bg-amber-500/10 border border-amber-500/20"
              data-testid="tool-status-running"
            >
              <Clock className="w-3 h-3 animate-spin" />
              <span>running</span>
            </span>
          )}

          {toolCall.status === 'success' && (
            <span
              className="flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20"
              data-testid="tool-status-done"
            >
              <CheckCircle2 className="w-3 h-3" />
              <span>done</span>
            </span>
          )}

          {toolCall.status === 'error' && (
            <span
              className="flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-medium text-rose-400 bg-rose-500/10 border border-rose-500/20"
              data-testid="tool-status-error"
            >
              <XCircle className="w-3 h-3" />
              <span>error</span>
            </span>
          )}

          {toolCall.status === 'denied' && (
            <span
              className="flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-medium text-slate-400 bg-slate-500/10 border border-slate-500/20"
              data-testid="tool-status-denied"
            >
              <AlertTriangle className="w-3 h-3" />
              <span>denied</span>
            </span>
          )}
        </div>
      </button>

      {/* Expanded body */}
      {isExpanded && (
        <div
          role="region"
          aria-label={`${friendlyName} details`}
          className="p-3.5 border-t border-slate-800 bg-slate-950/80 font-mono text-xs space-y-3"
        >
          {/* Input Parameters */}
          <div>
            <div className="flex items-center space-x-1.5 text-[11px] uppercase tracking-wider font-semibold text-slate-400 mb-1.5">
              <FileCode className="w-3.5 h-3.5 text-indigo-400" />
              <span>Input Parameters</span>
            </div>
            <pre className="p-2.5 rounded-lg bg-slate-900 border border-slate-800/80 text-slate-300 overflow-x-auto text-[11px] leading-relaxed">
              {JSON.stringify(toolCall.input || {}, null, 2)}
            </pre>
          </div>

          {/* Output / Evidence */}
          {safeOutputText !== null && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center space-x-1.5 text-[11px] uppercase tracking-wider font-semibold text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Evidence / Output</span>
                </div>
                {isOutputLong && (
                  <button
                    type="button"
                    onClick={() => setShowFullOutput(!showFullOutput)}
                    className="text-[11px] text-indigo-400 hover:text-indigo-300 font-sans underline"
                  >
                    {showFullOutput ? 'Show less' : 'Show full output'}
                  </button>
                )}
              </div>
              <pre className="p-2.5 rounded-lg bg-slate-900 border border-slate-800/80 text-emerald-300 overflow-x-auto text-[11px] leading-relaxed max-h-96">
                {displayedOutput}
              </pre>
            </div>
          )}

          {/* Error Message */}
          {toolCall.error && (
            <div>
              <div className="flex items-center space-x-1.5 text-[11px] uppercase tracking-wider font-semibold text-rose-400 mb-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Tool Execution Error</span>
              </div>
              <div
                className="p-3 rounded-lg bg-rose-950/40 border border-rose-900/60 text-rose-300 overflow-x-auto text-[11px] leading-relaxed"
                data-testid="tool-error-message"
              >
                <p className="font-semibold mb-1">Raw Error Message:</p>
                <pre className="whitespace-pre-wrap">{toolCall.error}</pre>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
