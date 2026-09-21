import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { Button } from './Button';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught React Error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[60vh] flex items-center justify-center p-6">
          <div className="max-w-md w-full glass-card rounded-2xl p-6 sm:p-8 text-center space-y-4 border border-rose-500/30 bg-[#0e172a]">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/10 text-rose-400 flex items-center justify-center mx-auto border border-rose-500/20">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">
                {this.props.fallbackTitle || 'Something went wrong'}
              </h3>
              <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                An unexpected error occurred while displaying this page.
              </p>
              {this.state.error?.message && (
                <div className="mt-3 p-2.5 rounded-lg bg-slate-900/80 border border-slate-800 text-[11px] font-mono text-rose-300 text-left truncate">
                  {this.state.error.message}
                </div>
              )}
            </div>
            <div className="pt-2 flex items-center justify-center gap-3">
              <Button
                variant="secondary"
                size="sm"
                onClick={this.handleReset}
                leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
              >
                Reload Page
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => (window.location.href = '/')}
                leftIcon={<Home className="w-3.5 h-3.5" />}
              >
                Go to Dashboard
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
