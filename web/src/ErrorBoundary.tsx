import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = {
    error: null,
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, _errorInfo: ErrorInfo) {
    console.error(error);
  }

  render() {
    if (this.state.error) {
      return (
        <section className="notice notice-error" role="alert">
          <h2>Shell error</h2>
          <p>
            The WebUI shell stopped before loading workflow surfaces. Refresh
            after fixing the local issue.
          </p>
        </section>
      );
    }

    return this.props.children;
  }
}
