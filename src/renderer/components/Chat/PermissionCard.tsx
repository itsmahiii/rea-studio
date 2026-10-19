import React, { useState, useEffect } from 'react';
import { ShieldAlert, Check, X, Clock, AlertTriangle } from 'lucide-react';
import type { ApprovalRequest } from '../../../shared/ipc';
import { getToolFriendlyName } from '../../../shared/toolClassification';

interface PermissionCardProps {
  request: ApprovalRequest;
  onRespond: (approvalId: string, approved: boolean) => void;
  initialSeconds?: number;
}

export const PermissionCard: React.FC<PermissionCardProps> = ({
  request,
  onRespond,
  initialSeconds = 60,
}) => {
  const [secondsRemaining, setSecondsRemaining] = useState(initialSeconds);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (secondsRemaining <= 0) {
      if (!isSubmitting) {
        setIsSubmitting(true);
        onRespond(request.approvalId, false);
      }
      return;
    }

    const timer = setInterval(() => {
      setSecondsRemaining((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [secondsRemaining, isSubmitting, onRespond, request.approvalId]);

  const handleAction = async (approved: boolean) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    onRespond(request.approvalId, approved);
  };

  const friendlyName = getToolFriendlyName(request.toolName);

  return (
    <div
      role="alertdialog"
      aria-labelledby={`perm-title-${request.approvalId}`}
      aria-describedby={`perm-desc-${request.approvalId}`}
      className="my-3 p-4 rounded-2xl bg-amber-950/20 border-2 border-amber-500/40 shadow-lg space-y-3 transition-all"
      data-testid={`permission-card-${request.approvalId}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start space-x-3">
          <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex-shrink-0">
            <ShieldAlert className="w-5 h-5" />
          </div>

          <div>
            <div className="flex items-center space-x-2">
              <h3
                id={`perm-title-${request.approvalId}`}
                className="text-sm font-semibold text-amber-200"
              >
                Risky Action Permission Required
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                Runs Target
              </span>
            </div>

            <p
              id={`perm-desc-${request.approvalId}`}
              className="text-xs text-amber-300/90 mt-1 leading-relaxed font-medium"
            >
              {request.reason}
            </p>

            {/* Action Tool & Parameters */}
            <div className="mt-2.5 p-3 rounded-xl bg-slate-950/90 border border-slate-800 text-xs font-mono">
              <div className="flex items-center space-x-2 text-indigo-400 font-semibold mb-1">
                <span>{friendlyName}</span>
                <span className="text-[10px] text-slate-500 font-normal">
                  ({request.toolName})
                </span>
              </div>
              <pre className="text-[11px] text-slate-300 overflow-x-auto max-h-48 whitespace-pre-wrap">
                {JSON.stringify(request.params || {}, null, 2)}
              </pre>
            </div>
          </div>
        </div>

        {/* Countdown Timer */}
        <div
          className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg border font-mono text-xs flex-shrink-0 ${
            secondsRemaining <= 10
              ? 'bg-rose-950/40 border-rose-500/50 text-rose-300 animate-pulse'
              : 'bg-slate-900 border-slate-800 text-amber-400'
          }`}
          data-testid="countdown-timer"
          aria-live="polite"
        >
          <Clock className="w-3.5 h-3.5" />
          <span>{secondsRemaining}s</span>
        </div>
      </div>

      {/* Buttons */}
      <div className="flex items-center justify-end space-x-3 pt-1 border-t border-amber-500/20">
        <button
          type="button"
          disabled={isSubmitting}
          onClick={() => handleAction(false)}
          aria-label="Deny risky action"
          className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 hover:border-slate-700 text-xs font-semibold transition disabled:opacity-50"
          data-testid="permission-deny-btn"
        >
          <X className="w-4 h-4 text-rose-400" />
          <span>Deny</span>
        </button>

        <button
          type="button"
          disabled={isSubmitting}
          onClick={() => handleAction(true)}
          aria-label="Allow risky action once"
          className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold shadow-md shadow-amber-600/20 transition disabled:opacity-50"
          data-testid="permission-allow-btn"
        >
          <Check className="w-4 h-4" />
          <span>Allow once</span>
        </button>
      </div>
    </div>
  );
};
