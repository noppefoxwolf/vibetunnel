import { LitElement, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

interface FileInfo {
  name: string;
  created: string;
  lastModified: string;
  size: number;
  isDir: boolean;
}

interface DirectoryListing {
  absolutePath: string;
  files: FileInfo[];
}

@customElement('file-browser')
export class FileBrowser extends LitElement {
  // Disable shadow DOM to use Tailwind
  createRenderRoot() {
    return this;
  }

  @property({ type: String }) currentPath = '~';
  @property({ type: Boolean }) visible = false;

  @state() private files: FileInfo[] = [];
  @state() private loading = false;
  @state() private showCreateFolder = false;
  @state() private newFolderName = '';
  @state() private creating = false;

  async connectedCallback() {
    super.connectedCallback();
    if (this.visible) {
      await this.loadDirectory(this.currentPath);
    }
  }

  async updated(changedProperties: Map<string, unknown>) {
    if (changedProperties.has('visible') && this.visible) {
      await this.loadDirectory(this.currentPath);
    }
  }

  private async loadDirectory(dirPath: string) {
    this.loading = true;
    try {
      const response = await fetch(`/api/fs/browse?path=${encodeURIComponent(dirPath)}`);
      if (response.ok) {
        const data: DirectoryListing = await response.json();
        this.currentPath = data.absolutePath;
        this.files = data.files;
      } else {
        console.error('Failed to load directory');
      }
    } catch (error) {
      console.error('Error loading directory:', error);
    } finally {
      this.loading = false;
    }
  }

  private handleDirectoryClick(dirName: string) {
    const newPath = this.currentPath + '/' + dirName;
    this.loadDirectory(newPath);
  }

  private handleParentClick() {
    const parentPath = this.currentPath.split('/').slice(0, -1).join('/') || '/';
    this.loadDirectory(parentPath);
  }

  private handleSelect() {
    this.dispatchEvent(
      new CustomEvent('directory-selected', {
        detail: this.currentPath,
      })
    );
  }

  private handleCancel() {
    this.dispatchEvent(new CustomEvent('browser-cancel'));
  }

  private handleCreateFolder() {
    this.showCreateFolder = true;
    this.newFolderName = '';
  }

  private handleCancelCreateFolder() {
    this.showCreateFolder = false;
    this.newFolderName = '';
  }

  private handleFolderNameInput(e: Event) {
    this.newFolderName = (e.target as HTMLInputElement).value;
  }

  private handleFolderNameKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      this.createFolder();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      this.handleCancelCreateFolder();
    }
  }

  private async createFolder() {
    if (!this.newFolderName.trim()) return;

    this.creating = true;
    try {
      const response = await fetch('/api/mkdir', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          path: this.currentPath,
          name: this.newFolderName.trim(),
        }),
      });

      if (response.ok) {
        // Refresh directory listing
        await this.loadDirectory(this.currentPath);
        this.handleCancelCreateFolder();
      } else {
        const error = await response.json();
        alert(`Failed to create folder: ${error.error}`);
      }
    } catch (error) {
      console.error('Error creating folder:', error);
      alert('Failed to create folder');
    } finally {
      this.creating = false;
    }
  }

  render() {
    if (!this.visible) {
      return html``;
    }

    return html`
      <div
        class="modal-backdrop flex items-center justify-center z-50 animate-fade-in"
      >
        <div
          class="modal-content w-96 max-w-full mx-4 h-96 flex flex-col font-mono text-sm animate-scale-in"
        >
          <div class="pb-4 border-b border-dark-border flex-shrink-0">
            <div class="flex justify-between items-center mb-2">
              <h3 class="text-accent-green text-lg font-semibold">Select Directory</h3>
              <button
                class="btn-ghost text-xs !px-3 !py-1"
                @click=${this.handleCreateFolder}
                ?disabled=${this.loading}
                title="Create new folder"
              >
                + folder
              </button>
            </div>
            <div class="text-dark-text-muted text-xs break-all">${this.currentPath}</div>
          </div>

          <div class="py-4 flex-1 overflow-y-auto">
            ${this.loading
              ? html` <div class="text-dark-text-muted text-center py-8">Loading...</div> `
              : html`
                  ${this.currentPath !== '/'
                    ? html`
                        <div
                          class="flex items-center gap-3 px-4 py-2 hover:bg-dark-bg-secondary cursor-pointer text-accent-green transition-all duration-200"
                          @click=${this.handleParentClick}
                        >
                          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 17l-5-5m0 0l5-5m-5 5h12" />
                          </svg>
                          <span>.. (parent directory)</span>
                        </div>
                      `
                    : ''}
                  ${this.files
                    .filter((f) => f.isDir)
                    .map(
                      (file) => html`
                        <div
                          class="flex items-center gap-3 px-4 py-2 hover:bg-dark-bg-secondary cursor-pointer text-dark-text transition-all duration-200"
                          @click=${() => this.handleDirectoryClick(file.name)}
                        >
                          <svg class="w-4 h-4 text-accent-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                          </svg>
                          <span>${file.name}</span>
                        </div>
                      `
                    )}
                  ${this.files
                    .filter((f) => !f.isDir)
                    .map(
                      (file) => html`
                        <div class="flex items-center gap-3 px-4 py-2 text-dark-text-dim">
                          <svg class="w-4 h-4 text-dark-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          <span>${file.name}</span>
                        </div>
                      `
                    )}
                `}
          </div>

          <!-- Create folder dialog -->
          ${this.showCreateFolder
            ? html`
                <div class="p-4 border-t border-dark-border flex-shrink-0 animate-slide-up">
                  <div class="text-accent-green text-sm mb-3">Create New Folder</div>
                  <div class="flex gap-3">
                    <input
                      type="text"
                      class="input-field font-mono text-sm flex-1"
                      placeholder="Folder name"
                      .value=${this.newFolderName}
                      @input=${this.handleFolderNameInput}
                      @keydown=${this.handleFolderNameKeydown}
                      ?disabled=${this.creating}
                    />
                    <button
                      class="btn-secondary text-xs !px-3 disabled:opacity-50 disabled:cursor-not-allowed"
                      @click=${this.createFolder}
                      ?disabled=${this.creating || !this.newFolderName.trim()}
                    >
                      ${this.creating ? '...' : 'create'}
                    </button>
                    <button
                      class="btn-ghost text-xs !px-3 disabled:opacity-50 disabled:cursor-not-allowed"
                      @click=${this.handleCancelCreateFolder}
                      ?disabled=${this.creating}
                    >
                      cancel
                    </button>
                  </div>
                </div>
              `
            : ''}

          <div class="pt-4 border-t border-dark-border grid grid-cols-2 gap-3 flex-shrink-0">
            <button
              class="btn-ghost font-mono h-12"
              @click=${this.handleCancel}
            >
              Cancel
            </button>
            <button
              class="btn-primary font-mono h-12"
              @click=${this.handleSelect}
            >
              Select
            </button>
          </div>
        </div>
      </div>
    `;
  }
}