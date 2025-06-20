import { LitElement, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
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
  @state() private currentTime = Date.now();

  private killingInterval: number | null = null;
  private uptimeInterval: number | null = null;

  connectedCallback() {
    super.connectedCallback();
    // Update time every second for real-time uptime display
    this.uptimeInterval = window.setInterval(() => {
      this.currentTime = Date.now();
      this.requestUpdate();
    }, 1000);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.killingInterval) {
      clearInterval(this.killingInterval);
    }
    if (this.uptimeInterval) {
      clearInterval(this.uptimeInterval);
    }
  }

  private handleCardClick() {
    this.dispatchEvent(
      new CustomEvent('session-select', {
        detail: this.session,
        bubbles: true,
        composed: true,
      })
    );
  }

  private async handleKillClick(e: Event) {
    e.stopPropagation();
    e.preventDefault();

    // Start killing animation
    this.killing = true;
    this.killingFrame = 0;
    this.killingInterval = window.setInterval(() => {
      this.killingFrame = (this.killingFrame + 1) % 4;
      this.requestUpdate();
    }, 200);

    // Send kill request
    try {
      const response = await fetch(`/api/sessions/${this.session.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.text();
        console.error('Failed to kill session:', errorData);
        throw new Error(`Kill failed: ${response.status}`);
      }

      // Kill succeeded - dispatch event to notify parent components
      this.dispatchEvent(
        new CustomEvent('session-killed', {
          detail: {
            sessionId: this.session.id,
            session: this.session,
          },
          bubbles: true,
          composed: true,
        })
      );

      console.log(`Session ${this.session.id} killed successfully`);
    } catch (error) {
      console.error('Error killing session:', error);

      // Show error to user (keep animation to indicate something went wrong)
      this.dispatchEvent(
        new CustomEvent('session-kill-error', {
          detail: {
            sessionId: this.session.id,
            error: error instanceof Error ? error.message : 'Unknown error',
          },
          bubbles: true,
          composed: true,
        })
      );
    } finally {
      // Stop animation in all cases
      this.stopKillingAnimation();
    }
  }

  private stopKillingAnimation() {
    this.killing = false;
    if (this.killingInterval) {
      clearInterval(this.killingInterval);
      this.killingInterval = null;
    }
  }

  private getKillingText(): string {
    const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    return frames[this.killingFrame % frames.length];
  }

  private async handlePidClick(e: Event) {
    e.stopPropagation();
    e.preventDefault();

    if (this.session.pid) {
      try {
        await navigator.clipboard.writeText(this.session.pid.toString());
        console.log('PID copied to clipboard:', this.session.pid);
      } catch (error) {
        console.error('Failed to copy PID to clipboard:', error);
        // Fallback: select text manually
        this.fallbackCopyToClipboard(this.session.pid.toString());
      }
    }
  }

  private fallbackCopyToClipboard(text: string) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand('copy');
      console.log('PID copied to clipboard (fallback):', text);
    } catch (error) {
      console.error('Fallback copy failed:', error);
    }
    document.body.removeChild(textArea);
  }

  private getSessionUptime(): string {
    if (!this.session.startedAt) return 'Just started';

    const start = new Date(this.session.startedAt);
    const now = new Date();
    const diffMs = now.getTime() - start.getTime();

    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    } else {
      return `${seconds}s`;
    }
  }

  render() {
    return html`
      <div
        class="bg-dark-bg-secondary border border-dark-border rounded-lg overflow-hidden transition-all duration-200 cursor-pointer ${this
          .killing
          ? 'opacity-60'
          : ''} hover:border-accent-green-darker hover:shadow-glow-green-sm"
        @click=${this.handleCardClick}
      >
        <!-- Session Header -->
        <div class="flex justify-between items-center px-4 py-3">
          <div class="flex-1 min-w-0">
            <div
              class="text-accent-green font-mono text-base font-medium truncate"
              title="${this.session.name || this.session.id}"
            >
              ${this.session.name || this.session.id}
            </div>
          </div>
          ${this.session.status === 'running'
            ? html`
                <button
                  class="text-xs font-mono px-3 py-1 rounded border border-dark-border text-dark-text-muted hover:border-status-error hover:text-status-error hover:bg-status-error/10 transition-all"
                  @click=${this.handleKillClick}
                  ?disabled=${this.killing}
                >
                  ${this.killing ? 'killing...' : 'kill'}
                </button>
              `
            : ''}
        </div>

        <!-- Terminal Preview -->
        <div class="px-4 pb-3">
          <div
            class="bg-black rounded overflow-hidden border border-dark-border"
            style="aspect-ratio: 16/9;"
          >
            ${this.killing
              ? html`
                  <div class="w-full h-full flex items-center justify-center text-status-warning">
                    <div class="text-center font-mono">
                      <div class="text-2xl mb-2">${this.getKillingText()}</div>
                      <div class="text-xs">Terminating process...</div>
                    </div>
                  </div>
                `
              : html`
                  <vibe-terminal-buffer
                    .sessionId=${this.session.id}
                    .fontSize=${8}
                    .fitHorizontally=${true}
                    .pollInterval=${1000}
                    class="w-full h-full"
                    style="pointer-events: none;"
                  ></vibe-terminal-buffer>
                `}
          </div>
        </div>

        <!-- Session Stats -->
        <div class="px-4 pb-4 space-y-2">
          <!-- Status and Uptime -->
          <div class="flex items-center justify-between text-xs">
            <div class="flex items-center gap-2">
              <div class="w-2 h-2 rounded-full ${this.getStatusDotColor()}"></div>
              <span class="${this.getStatusColor()} font-medium"> ${this.getStatusText()} </span>
            </div>
            <span class="text-dark-text-muted"> ${this.getSessionUptime()} </span>
          </div>

          <!-- PID Info -->
          ${this.session.pid
            ? html`
                <div class="flex items-center justify-between text-xs">
                  <span class="text-dark-text-muted">PID</span>
                  <span
                    class="font-mono text-dark-text cursor-pointer hover:text-accent-green transition-colors"
                    @click=${this.handlePidClick}
                    title="Click to copy"
                  >
                    ${this.session.pid}
                  </span>
                </div>
              `
            : ''}

          <!-- Command Info -->
          <div class="flex items-center justify-between text-xs">
            <span class="text-dark-text-muted">Command</span>
            <span class="font-mono text-dark-text truncate ml-2" title="${this.session.command}">
              ${this.session.command}
            </span>
          </div>

          <!-- Terminal Size -->
          ${this.session.width && this.session.height
            ? html`
                <div class="flex items-center justify-between text-xs">
                  <span class="text-dark-text-muted">Size</span>
                  <span class="font-mono text-dark-text">
                    ${this.session.width}×${this.session.height}
                  </span>
                </div>
              `
            : ''}

          <!-- Working Directory -->
          <div class="flex items-center justify-between text-xs">
            <span class="text-dark-text-muted">Directory</span>
            <span class="font-mono text-dark-text truncate ml-2" title="${this.session.workingDir}">
              ${this.session.workingDir}
            </span>
          </div>
        </div>
      </div>
    `;
  }

  private getStatusText(): string {
    if (this.session.waiting) {
      return 'waiting';
    }
    return this.session.status;
  }

  private getStatusColor(): string {
    if (this.session.waiting) {
      return 'text-dark-text-muted';
    }
    return this.session.status === 'running' ? 'text-accent-green' : 'text-status-warning';
  }

  private getStatusDotColor(): string {
    if (this.session.waiting) {
      return 'bg-dark-text-dim';
    }
    return this.session.status === 'running' ? 'bg-accent-green' : 'bg-status-warning';
  }
}
