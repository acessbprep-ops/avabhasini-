import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error in ErrorBoundary:", error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReset = () => {
    try {
      localStorage.removeItem('avabhasini_history');
      localStorage.removeItem('avabhasini_owner_profile');
      localStorage.removeItem('avabhasini_profile_locked');
    } catch (e) {
      console.error("Failed to clear local storage:", e);
    }
    window.location.reload();
  };

  private handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-stone-950 flex flex-col items-center justify-center p-6 text-stone-200 font-sans">
          <div className="max-w-md w-full bg-stone-900 border border-red-500/20 rounded-3xl p-8 shadow-2xl relative overflow-hidden">
            <div className="absolute -top-10 -right-10 w-32 h-32 bg-red-500/5 rounded-full blur-3xl" />
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-500 mb-6 font-mono text-3xl font-black">
                !
              </div>
              <h2 className="text-xl font-bold text-white mb-2">Unexpected Diagnostics Error</h2>
              <p className="text-sm text-stone-400 mb-6 leading-relaxed">
                Avabhasini encountered an unexpected runtime exception. This issue might result from corrupted browser cache data or a state mismatch.
              </p>
              
              {this.state.error && (
                <div className="w-full text-left bg-stone-950 rounded-xl p-4 mb-6 border border-white/5 font-mono text-xs overflow-auto max-h-40 text-red-400/90 whitespace-pre-wrap select-all">
                  <p className="font-bold text-red-400 mb-1">{this.state.error.toString()}</p>
                  {this.state.errorInfo?.componentStack && (
                    <span className="text-[10px] text-stone-500">{this.state.errorInfo.componentStack}</span>
                  )}
                </div>
              )}
              
              <div className="flex flex-col sm:flex-row gap-3 w-full">
                <button
                  onClick={this.handleReload}
                  className="w-full py-3 px-4 bg-white/5 hover:bg-white/10 active:scale-[0.98] transition-all rounded-xl text-stone-200 text-xs font-bold uppercase tracking-wider border border-white/10"
                >
                  Reload Page
                </button>
                <button
                  onClick={this.handleReset}
                  className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 active:scale-[0.98] transition-all rounded-xl text-black text-xs font-black uppercase tracking-wider"
                >
                  Clear Cache & Reset
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
