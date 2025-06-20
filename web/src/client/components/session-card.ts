import { LitElement, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { apiService } from '../services/api-service.js';
import './vibe-terminal-buffer.js';

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

@customElement('session-card')
export class SessionCard extends LitElement {
  // Disable shadow DOM to use Tailwind
  createRenderRoot() {
    return this;
  }

  @property({ type: Object }) session!: Session;
  @state() private killing = false;
  @state() private killingFrame = 0;
  @state() private hasEscPrompt = false;

  private killingInterval: number | null = null;

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.killingInterval) {
      clearInterval(this.killingInterval);
    }
  }

  private startKillingAnimation() {
    if (!this.killing) {
      this.killing = true;
      this.killingFrame = 0;

      this.killingInterval = window.setInterval(() => {
        this.killingFrame = (this.killingFrame + 1) % 8;
        this.requestUpdate();
      }, 100);
    }
  }

  private stopKillingAnimation() {
    this.killing = false;
    this.killingFrame = 0;
    if (this.killingInterval) {
      clearInterval(this.killingInterval);
      this.killingInterval = null;
    }
  }

  private renderKillingAnimation() {
    const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧'];
    return html`<span class="text-vs-warning">${frames[this.killingFrame]}</span>`;
  }

  private async handleKill() {
    if (this.killing) return;

    this.startKillingAnimation();

    try {
      await apiService.postJSON(`/api/sessions/${this.session.id}/kill`, {});

      // Dispatch event to parent
      this.dispatchEvent(
        new CustomEvent('session-killed', {
          detail: this.session.id,
          bubbles: true,
          composed: true,
        })
      );
    } catch (error) {
      console.error('Error killing session:', error);
    } finally {
      this.stopKillingAnimation();
    }
  }

  private renderPid() {
    if (!this.session.pid) return html``;

    return html`
      <div class="font-mono text-xs" style="color: #8c8c8c;">PID: ${this.session.pid}</div>
    `;
  }

  private handleSessionClick(e: Event) {
    // Prevent navigation if clicking on the kill button
    const target = e.target as HTMLElement;
    if (target.closest('button')) {
      return;
    }

    // Navigate to session view
    const event = new CustomEvent('session-selected', {
      detail: this.session.id,
      bubbles: true,
      composed: true,
    });
    this.dispatchEvent(event);
  }

  render() {
    const isWaiting = this.session.waiting === true;
    const isRunning = this.session.status === 'running';
    const exitedClass = !isRunning ? 'opacity-60' : '';
    const borderClass = this.hasEscPrompt ? 'border-2 border-vs-nav-active' : 'border border-vs-border';

    // Format time
    const startTime = new Date(this.session.startedAt).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });

    return html`
      <div
        class="p-4 rounded ${exitedClass} ${borderClass} cursor-pointer hover:bg-vs-bg-secondary transition-all duration-150"
        style="background: rgba(0, 0, 0, 0.6);"
        @click=${this.handleSessionClick}
      >
        <div class="flex justify-between items-start mb-2">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              ${this.session.name
                ? html`<div class="font-mono text-sm text-vs-user">${this.session.name}</div>`
                : ''}
              <div
                class="font-mono text-xs px-2 py-0.5 rounded ${isRunning
                  ? 'bg-vs-link text-vs-bg'
                  : 'bg-vs-warning text-vs-bg'}"
              >
                ${isRunning ? 'running' : `exited (${this.session.exitCode || 0})`}
              </div>
              ${isWaiting
                ? html`<div class="font-mono text-xs px-2 py-0.5 rounded bg-vs-accent text-vs-bg">
                    waiting
                  </div>`
                : ''}
            </div>
            <div class="font-mono text-xs truncate" style="color: #9cdcfe;">
              ${this.session.command}
            </div>
            <div
              class="font-mono text-xs truncate"
              style="color: #8c8c8c;"
              title="${this.session.workingDir}"
            >
              ${this.session.workingDir}
            </div>
          </div>
          <div class="flex flex-col items-end gap-1">
            <div class="font-mono text-xs" style="color: #8c8c8c;">${startTime}</div>
            ${this.renderPid()}
            ${isRunning
              ? html`
                  <button
                    class="px-2 py-1 font-mono text-xs rounded ${this.killing
                      ? 'bg-vs-warning text-vs-bg'
                      : 'bg-vs-error text-vs-bg hover:bg-red-600'} transition-colors"
                    @click=${this.handleKill}
                    ?disabled=${this.killing}
                  >
                    ${this.killing ? this.renderKillingAnimation() : 'kill'}
                  </button>
                `
              : ''}
          </div>
        </div>

        <!-- Terminal Preview -->
        <div
          class="session-preview mt-2 rounded overflow-hidden"
          style="background: #1e1e1e; border: 1px solid #3e3e42; position: relative;"
          @click=${(e: Event) => e.stopPropagation()}
        >
          <vibe-terminal-buffer
            session-id="${this.session.id}"
            preview="true"
            @esc-detected=${(e: CustomEvent) => {
              this.hasEscPrompt = e.detail.hasEscPrompt;
            }}
          ></vibe-terminal-buffer>
        </div>
      </div>
    `;
  }
}