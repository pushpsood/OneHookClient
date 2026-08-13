import React, { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

type BoundaryHandle = {
  props: Props;
  state: State;
  setState: (nextState: Partial<State>) => void;
};

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  private get boundary(): BoundaryHandle {
    return this as unknown as BoundaryHandle;
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);

    this.boundary.setState({
      error,
      errorInfo,
    });

    // Log to error tracking service (Sentry, Rollbar, etc.)
    if (typeof process !== 'undefined' && process.env.NODE_ENV === 'production') {
      // window.errorTracker?.captureException(error, { extra: errorInfo });
    }
  }

  handleReset = () => {
    this.boundary.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  handleGoHome = () => {
    if (typeof window !== 'undefined') {
      window.location.assign('/');
    }
  };

  render() {
    const boundary = this.boundary;

    if (boundary.state.hasError) {
      if (boundary.props.fallback) {
        return boundary.props.fallback;
      }

      return (
        <div className="min-h-screen bg-bg flex items-center justify-center p-8">
          <div className="max-w-md w-full bg-white border border-border p-12 text-center space-y-8">
            <div className="w-16 h-16 border-2 border-accent rounded-full flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6 text-accent" />
            </div>

            <div className="space-y-4">
              <h2 className="text-4xl font-serif italic uppercase tracking-tighter">
                Something Went Wrong
              </h2>
              <p className="text-xs opacity-60 leading-relaxed italic">
                Something unexpected happened. Try again, or head home and come back in a moment. If
                it keeps happening, please contact support.
              </p>
            </div>

            {typeof process !== 'undefined' &&
              process.env.NODE_ENV !== 'production' &&
              boundary.state.error && (
                <div className="text-left bg-bg p-4 rounded text-xs font-mono overflow-auto max-h-48">
                  <div className="font-bold mb-2">Error Details:</div>
                  <div className="text-red-600">{boundary.state.error.toString()}</div>
                  {boundary.state.errorInfo && (
                    <div className="mt-2 text-gray-600">
                      {boundary.state.errorInfo.componentStack}
                    </div>
                  )}
                </div>
              )}

            <div className="flex gap-4">
              <button
                onClick={this.handleReset}
                className="flex-1 py-4 border border-border text-[10px] font-bold uppercase tracking-[0.3em] hover:bg-bg transition-colors"
              >
                Try Again
              </button>
              <button
                onClick={this.handleGoHome}
                className="flex-1 py-4 bg-accent text-white text-[10px] font-bold uppercase tracking-[0.3em] hover:opacity-90 transition-opacity"
              >
                Back to Home
              </button>
            </div>
          </div>
        </div>
      );
    }

    return boundary.props.children;
  }
}
