// Catches render errors so one broken card never turns the whole app into a blank screen.
import { Component, type ComponentChildren } from 'preact';
import { fa } from '../strings.fa';
import { logError } from '../lib/errorLog';

interface State { failed: boolean }

export class ErrorBoundary extends Component<{ children: ComponentChildren }, State> {
  state: State = { failed: false };

  componentDidCatch(error: unknown) {
    logError('render', error);
    this.setState({ failed: true });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    const E = fa.crash;
    return (
      <div class="screen no-tabs fade-in">
        <h1 class="h1 lg" style="margin-top:56px">{E.title}</h1>
        <p class="lead">{E.lead}</p>
        <div class="spacer stack" style="padding-top:24px">
          {/* The app always opens on Today, so a fresh load is the reliable way home. */}
          <button class="btn" onClick={() => location.replace(location.pathname)}>{E.home}</button>
          <div class="muted small" style="line-height:1.8;text-align:center">{E.report}</div>
        </div>
      </div>
    );
  }
}
