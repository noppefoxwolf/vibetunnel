import { LitElement, html, PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import './file-browser.js';

export interface SessionCreateData {
  command: string[];
  workingDir: string;
  name?: string;
  spawn_terminal?: boolean;
  cols?: number;
  rows?: number;
}

@customElement('session-create-form')
export class SessionCreateForm extends LitElement {
  // Disable shadow DOM to use Tailwind
  createRenderRoot() {
    return this;
  }

  @property({ type: String }) workingDir = '~/';
  @property({ type: String }) command = 'zsh';
  @property({ type: String }) sessionName = '';
  @property({ type: Boolean }) disabled = false;
  @property({ type: Boolean }) visible = false;

  @state() private isCreating = false;
  @state() private showFileBrowser = false;

  private readonly STORAGE_KEY_WORKING_DIR = 'vibetunnel_last_working_dir';
  private readonly STORAGE_KEY_COMMAND = 'vibetunnel_last_command';

  connectedCallback() {
    super.connectedCallback();
    // Load from localStorage when component is first created
    this.loadFromLocalStorage();
  }

  private loadFromLocalStorage() {
    try {
      const savedWorkingDir = localStorage.getItem(this.STORAGE_KEY_WORKING_DIR);
      const savedCommand = localStorage.getItem(this.STORAGE_KEY_COMMAND);

      console.log('Loading from localStorage:', { savedWorkingDir, savedCommand });

      if (savedWorkingDir) {
        this.workingDir = savedWorkingDir;
      }
      if (savedCommand) {
        this.command = savedCommand;
      }

      // Force re-render to update the input values
      this.requestUpdate();
    } catch (error) {
      console.warn('Failed to load from localStorage:', error);
    }
  }

  private saveToLocalStorage() {
    try {
      const workingDir = this.workingDir.trim();
      const command = this.command.trim();

      console.log('Saving to localStorage:', { workingDir, command });

      // Only save non-empty values
      if (workingDir) {
        localStorage.setItem(this.STORAGE_KEY_WORKING_DIR, workingDir);
      }
      if (command) {
        localStorage.setItem(this.STORAGE_KEY_COMMAND, command);
      }
    } catch (error) {
      console.warn('Failed to save to localStorage:', error);
    }
  }

  updated(changedProperties: PropertyValues) {
    super.updated(changedProperties);

    // Load from localStorage when form becomes visible
    if (changedProperties.has('visible') && this.visible) {
      this.loadFromLocalStorage();
    }
  }

  private handleWorkingDirChange(e: Event) {
    const input = e.target as HTMLInputElement;
    this.workingDir = input.value;
    this.dispatchEvent(
      new CustomEvent('working-dir-change', {
        detail: this.workingDir,
      })
    );
  }

  private handleCommandChange(e: Event) {
    const input = e.target as HTMLInputElement;
    this.command = input.value;
  }

  private handleSessionNameChange(e: Event) {
    const input = e.target as HTMLInputElement;
    this.sessionName = input.value;
  }

  private handleBrowse() {
    this.showFileBrowser = true;
  }

  private handleDirectorySelected(e: CustomEvent) {
    this.workingDir = e.detail;
    this.showFileBrowser = false;
  }

  private handleBrowserCancel() {
    this.showFileBrowser = false;
  }

  private async handleCreate() {
    if (!this.workingDir.trim() || !this.command.trim()) {
      this.dispatchEvent(
        new CustomEvent('error', {
          detail: 'Please fill in both working directory and command',
        })
      );
      return;
    }

    this.isCreating = true;

    // Use conservative defaults that work well across devices
    // The terminal will auto-resize to fit the actual container after creation
    const terminalCols = 120;
    const terminalRows = 30;

    const sessionData: SessionCreateData = {
      command: this.parseCommand(this.command.trim()),
      workingDir: this.workingDir.trim(),
      spawn_terminal: true,
      cols: terminalCols,
      rows: terminalRows,
    };

    // Add session name if provided
    if (this.sessionName.trim()) {
      sessionData.name = this.sessionName.trim();
    }

    try {
      const response = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sessionData),
      });

      if (response.ok) {
        const result = await response.json();

        // Save to localStorage before clearing the fields
        this.saveToLocalStorage();

        this.command = ''; // Clear command on success
        this.sessionName = ''; // Clear session name on success
        this.dispatchEvent(
          new CustomEvent('session-created', {
            detail: result,
          })
        );
      } else {
        const error = await response.json();
        this.dispatchEvent(
          new CustomEvent('error', {
            detail: `Failed to create session: ${error.error}`,
          })
        );
      }
    } catch (error) {
      console.error('Error creating session:', error);
      this.dispatchEvent(
        new CustomEvent('error', {
          detail: 'Failed to create session',
        })
      );
    } finally {
      this.isCreating = false;
    }
  }

  private parseCommand(commandStr: string): string[] {
    // Simple command parsing - split by spaces but respect quotes
    const args: string[] = [];
    let current = '';
    let inQuotes = false;
    let quoteChar = '';

    for (let i = 0; i < commandStr.length; i++) {
      const char = commandStr[i];

      if ((char === '"' || char === "'") && !inQuotes) {
        inQuotes = true;
        quoteChar = char;
      } else if (char === quoteChar && inQuotes) {
        inQuotes = false;
        quoteChar = '';
      } else if (char === ' ' && !inQuotes) {
        if (current) {
          args.push(current);
          current = '';
        }
      } else {
        current += char;
      }
    }

    if (current) {
      args.push(current);
    }

    return args;
  }

  private handleCancel() {
    this.dispatchEvent(new CustomEvent('cancel'));
  }

  render() {
    if (!this.visible) {
      return html``;
    }

    return html`
      <div class="modal-backdrop flex items-center justify-center z-50">
        <div class="modal-content w-96 max-w-full mx-4 font-mono text-sm">
          <div class="pb-6 border-b border-dark-border">
            <h2 class="text-accent-green text-lg font-semibold">New Terminal Session</h2>
          </div>

          <div class="pt-6 space-y-6">
            <div>
              <label class="form-label">
                <svg
                  class="w-4 h-4 text-accent-green"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                Session Name (Optional)
              </label>
              <input
                type="text"
                class="input-field font-mono"
                .value=${this.sessionName}
                @input=${this.handleSessionNameChange}
                placeholder="My Session"
                ?disabled=${this.disabled || this.isCreating}
              />
            </div>

            <div>
              <label class="form-label">
                <svg
                  class="w-4 h-4 text-accent-green"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                  />
                </svg>
                Working Directory
              </label>
              <div class="flex gap-3">
                <input
                  type="text"
                  class="input-field font-mono flex-1"
                  .value=${this.workingDir}
                  @input=${this.handleWorkingDirChange}
                  placeholder="/Users/user/projects"
                  ?disabled=${this.disabled || this.isCreating}
                />
                <button
                  class="btn-secondary font-mono !px-4"
                  @click=${this.handleBrowse}
                  ?disabled=${this.disabled || this.isCreating}
                >
                  Browse
                </button>
              </div>
            </div>

            <div>
              <label class="form-label">
                <svg
                  class="w-4 h-4 text-accent-green"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
                Command
              </label>
              <input
                type="text"
                class="input-field font-mono"
                .value=${this.command}
                @input=${this.handleCommandChange}
                @keydown=${(e: KeyboardEvent) => e.key === 'Enter' && this.handleCreate()}
                placeholder="zsh"
                ?disabled=${this.disabled || this.isCreating}
              />
            </div>

            <div class="mb-6">
              <label class="form-label text-dark-text-dim">QUICK START</label>
              <div class="grid grid-cols-2 gap-3">
                <button
                  class="quick-start-btn font-mono flex items-center gap-2 ${this.command === 'zsh'
                    ? 'active'
                    : ''}"
                  @click=${() => {
                    this.command = 'zsh';
                    this.requestUpdate();
                  }}
                  ?disabled=${this.disabled || this.isCreating}
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                  zsh
                </button>
                <button
                  class="quick-start-btn font-mono flex items-center gap-2 ${this.command === 'bash'
                    ? 'active'
                    : ''}"
                  @click=${() => {
                    this.command = 'bash';
                    this.requestUpdate();
                  }}
                  ?disabled=${this.disabled || this.isCreating}
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                  bash
                </button>
                <button
                  class="quick-start-btn font-mono flex items-center gap-2 ${this.command ===
                  'claude'
                    ? 'active'
                    : ''}"
                  @click=${() => {
                    this.command = 'claude';
                    this.requestUpdate();
                  }}
                  ?disabled=${this.disabled || this.isCreating}
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                    />
                  </svg>
                  claude
                </button>
                <button
                  class="quick-start-btn font-mono flex items-center gap-2 ${this.command === 'node'
                    ? 'active'
                    : ''}"
                  @click=${() => {
                    this.command = 'node';
                    this.requestUpdate();
                  }}
                  ?disabled=${this.disabled || this.isCreating}
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5"
                    />
                  </svg>
                  node
                </button>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-3 pt-6 border-t border-dark-border">
              <button
                class="btn-ghost font-mono h-12"
                @click=${this.handleCancel}
                ?disabled=${this.isCreating}
              >
                Cancel
              </button>
              <button
                class="btn-primary font-mono h-12 disabled:opacity-50 disabled:cursor-not-allowed"
                @click=${this.handleCreate}
                ?disabled=${this.disabled ||
                this.isCreating ||
                !this.workingDir.trim() ||
                !this.command.trim()}
              >
                ${this.isCreating ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <file-browser
        .visible=${this.showFileBrowser}
        .currentPath=${this.workingDir}
        @directory-selected=${this.handleDirectorySelected}
        @browser-cancel=${this.handleBrowserCancel}
      ></file-browser>
    `;
  }
}
