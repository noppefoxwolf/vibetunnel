import { LitElement, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import './session-create-form.js';
import './session-card.js';
import './terminal-icon.js';

export interface Session {
  id: string;
  command: string;
  workingDir: string;
  name?: string;
  status: 'running' | 'exited';
  exitCode?: number;
  startedAt: string;
  lastModified: string;
  pid?: number;
  waiting?: boolean;
  width?: number;
  height?: number;
}

@customElement('session-list')
export class SessionList extends LitElement {
  // Disable shadow DOM to use Tailwind
  createRenderRoot() {
    return this;
  }

  @property({ type: Array }) sessions: Session[] = [];
  @property({ type: Boolean }) loading = false;
  @property({ type: Boolean }) hideExited = true;
  @property({ type: Boolean }) showCreateModal = false;

  @state() private cleaningExited = false;
  private previousRunningCount = 0;

  private handleRefresh() {
    this.dispatchEvent(new CustomEvent('refresh'));
  }

  private handleSessionSelect(e: CustomEvent) {
    const session = e.detail as Session;
    window.location.search = `?session=${session.id}`;
  }

  private handleSessionKilled(e: CustomEvent) {
    const { sessionId } = e.detail;
    console.log(`Session ${sessionId} killed, updating session list...`);

    // Immediately remove the session from the local state for instant UI feedback
    this.sessions = this.sessions.filter((session) => session.id !== sessionId);

    // Then trigger a refresh to get the latest server state
    this.dispatchEvent(new CustomEvent('refresh'));
  }

  private handleSessionKillError(e: CustomEvent) {
    const { sessionId, error } = e.detail;
    console.error(`Failed to kill session ${sessionId}:`, error);

    // Dispatch error event to parent for user notification
    this.dispatchEvent(
      new CustomEvent('error', {
        detail: `Failed to kill session: ${error}`,
      })
    );
  }

  public async handleCleanupExited() {
    if (this.cleaningExited) return;

    this.cleaningExited = true;
    this.requestUpdate();

    try {
      const response = await fetch('/api/cleanup-exited', {
        method: 'POST',
      });

      if (response.ok) {
        this.dispatchEvent(new CustomEvent('refresh'));
      } else {
        this.dispatchEvent(
          new CustomEvent('error', { detail: 'Failed to cleanup exited sessions' })
        );
      }
    } catch (error) {
      console.error('Error cleaning up exited sessions:', error);
      this.dispatchEvent(new CustomEvent('error', { detail: 'Failed to cleanup exited sessions' }));
    } finally {
      this.cleaningExited = false;
      this.requestUpdate();
    }
  }

  render() {
    const filteredSessions = this.hideExited
      ? this.sessions.filter((session) => session.status !== 'exited')
      : this.sessions;

    return html`
      <div class="font-mono text-sm p-6 min-h-screen bg-dark-bg">
        ${filteredSessions.length === 0
          ? html`
              <div class="flex flex-col items-center justify-center text-center py-24">
                <terminal-icon size="80" glow></terminal-icon>
                <h2 class="text-2xl font-bold text-dark-text mt-6 mb-2">No Sessions</h2>
                <p class="text-dark-text-muted mb-8">
                  ${this.loading
                    ? 'Loading sessions...'
                    : this.hideExited && this.sessions.length > 0
                      ? 'No running terminal sessions'
                      : 'Create a new terminal session to get started'}
                </p>
                ${!this.loading
                  ? html`
                      <button
                        class="btn-secondary font-mono flex items-center gap-2"
                        @click=${() => (this.showCreateModal = true)}
                      >
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M12 4v16m8-8H4"
                          />
                        </svg>
                        Create Session
                      </button>
                    `
                  : ''}
              </div>
            `
          : html`
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                ${repeat(
                  filteredSessions,
                  (session) => session.id,
                  (session) => html`
                    <session-card
                      .session=${session}
                      @session-select=${this.handleSessionSelect}
                      @session-killed=${this.handleSessionKilled}
                      @session-kill-error=${this.handleSessionKillError}
                    >
                    </session-card>
                  `
                )}
              </div>
            `}

        <session-create-form
          .visible=${this.showCreateModal}
          @session-created=${(e: CustomEvent) =>
            this.dispatchEvent(new CustomEvent('session-created', { detail: e.detail }))}
          @cancel=${() => this.dispatchEvent(new CustomEvent('create-modal-close'))}
          @error=${(e: CustomEvent) =>
            this.dispatchEvent(new CustomEvent('error', { detail: e.detail }))}
        ></session-create-form>
      </div>
    `;
  }
}
