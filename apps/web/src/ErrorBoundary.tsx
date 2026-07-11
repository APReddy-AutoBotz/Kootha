import { Component, ErrorInfo, ReactNode } from "react";

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() { return { failed: true }; }

  componentDidCatch(error: Error, info: ErrorInfo) {
    window.dispatchEvent(new CustomEvent("kootha:ui-error", { detail: { name: error.name, componentStack: Boolean(info.componentStack) } }));
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return <main className="app-error-boundary"><div><img src="/assets/kootha-logo.svg" alt="Kootha" /><h1>Something went wrong</h1><p>This screen could not be opened. Your saved work was not changed.</p><button className="primary-button" type="button" onClick={() => window.location.reload()}>Reload</button></div></main>;
  }
}
