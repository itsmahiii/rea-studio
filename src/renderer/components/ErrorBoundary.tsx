import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Trash2 } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public override state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Sanitize any potential sensitive tokens from error object
    const sanitizedMessage = error.message.replace(/sk-ant-[a-zA-Z0-9_-]{20,}/g, '[REDACTED_API_KEY]');
    console.error('ErrorBoundary caught an unhandled rendering error:', sanitizedMessage, errorInfo);
    this.setState({ error, errorInfo });
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  private handleReset = (): void => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {
      // Ignore storage clear failure
    }
    window.location.reload();
  };

  public override render(): ReactNode {
    if (this.state.hasError) {
      const sanitizedMessage = this.state.error?.message
        ? this.state.error.message.replace(/sk-ant-[a-zA-Z0-9_-]{20,}/g, '[REDACTED_API_KEY]')
        : 'An unexpected application error occurred.';

      return (
        <div
          data-testid="error-boundary-fallback"
          className="min-h-screen w-full bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 select-none"
        >
          <div className="max-w-lg w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl">
            <div className="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mb-4">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <h1 className="text-xl font-bold tracking-tight text-white mb-2">
              Something went wrong
            </h1>
            <p className="text-sm text-slate-400 mb-4 leading-relaxed">
              REA Studio encountered an unexpected UI rendering error. You can attempt to reload the window or reset local view state.
            </p>

            <div className="mb-6 p-3 rounded-lg bg-slate-950 border border-slate-800/80 font-mono text-xs text-rose-300 max-h-36 overflow-y-auto break-all">
              {sanitizedMessage}
            </div>

            <div className="flex items-center space-x-3">
              <button
                type="button"
                onClick={this.handleReload}
                className="flex-1 inline-flex items-center justify-center space-x-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm transition focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Reload App</span>
              </button>

              <button
                type="button"
                onClick={this.handleReset}
                className="inline-flex items-center justify-center space-x-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-sm transition border border-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-600"
              >
                <Trash2 className="w-4 h-4 text-slate-400" />
                <span>Reset State</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
