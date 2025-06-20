import { LitElement, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { TauriService, isTauri, type Settings } from '../services/tauri-service.js';

@customElement('settings-window')
export class SettingsWindow extends LitElement {
  // Disable shadow DOM to use Tailwind
  createRenderRoot() {
    return this;
  }

  @property({ type: Boolean }) visible = false;
  @state() private settings: Settings | null = null;
  @state() private loading = false;
  @state() private saving = false;
  @state() private error = '';

  async connectedCallback() {
    super.connectedCallback();
    if (this.visible) {
      await this.loadSettings();
    }
  }

  async updated(changedProperties: Map<string, unknown>) {
    if (changedProperties.has('visible') && this.visible) {
      await this.loadSettings();
    }
  }

  private async loadSettings() {
    if (!isTauri()) return;

    this.loading = true;
    this.error = '';

    try {
      this.settings = await TauriService.getSettings();
    } catch (error) {
      console.error('Error loading settings:', error);
      this.error = 'Failed to load settings';
    } finally {
      this.loading = false;
    }
  }

  private async saveSettings() {
    if (!this.settings || !isTauri()) return;

    this.saving = true;
    this.error = '';

    try {
      await TauriService.saveSettings(this.settings);

      // Show success message
      const successEl = this.querySelector('.success-message') as HTMLElement;
      if (successEl) {
        successEl.style.display = 'block';
        setTimeout(() => {
          successEl.style.display = 'none';
        }, 3000);
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      this.error = 'Failed to save settings';
    } finally {
      this.saving = false;
    }
  }

  private handleClose() {
    this.dispatchEvent(new CustomEvent('settings-close'));
  }

  private updateSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
    if (!this.settings) return;
    this.settings = { ...this.settings, [key]: value };
  }

  render() {
    if (!this.visible) return html``;

    return html`
      <div
        class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 animate-fade-in"
      >
        <div
          class="bg-gray-900 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden transform transition-all duration-300 scale-100 animate-slide-up"
        >
          <!-- Header -->
          <div
            class="bg-gray-800 px-6 py-4 border-b border-gray-700 flex items-center justify-between"
          >
            <h2 class="text-xl font-semibold text-gray-100">Settings</h2>
            <button
              @click=${this.handleClose}
              class="text-gray-400 hover:text-gray-200 transition-colors"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          <!-- Content -->
          <div class="overflow-y-auto" style="max-height: calc(90vh - 144px);">
            ${this.loading
              ? html` <div class="p-8 text-center text-gray-400">Loading settings...</div> `
              : this.settings
                ? html`
                    <div class="p-6 space-y-6">
                      <!-- General Section -->
                      <section>
                        <h3 class="text-lg font-medium text-gray-200 mb-4">General</h3>

                        <div class="space-y-4">
                          <!-- Launch at Login -->
                          <label class="flex items-center justify-between group">
                            <span class="text-gray-300 transition-colors group-hover:text-gray-100"
                              >Launch at login</span
                            >
                            <input
                              type="checkbox"
                              .checked=${this.settings.launch_at_login}
                              @change=${(e: Event) =>
                                this.updateSetting(
                                  'launch_at_login',
                                  (e.target as HTMLInputElement).checked
                                )}
                              class="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500 transition-transform group-hover:scale-110"
                            />
                          </label>

                          <!-- Show in Dock -->
                          <label class="flex items-center justify-between group">
                            <span class="text-gray-300 transition-colors group-hover:text-gray-100"
                              >Show in Dock</span
                            >
                            <input
                              type="checkbox"
                              .checked=${this.settings.show_in_dock}
                              @change=${(e: Event) =>
                                this.updateSetting(
                                  'show_in_dock',
                                  (e.target as HTMLInputElement).checked
                                )}
                              class="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500 transition-transform group-hover:scale-110"
                            />
                          </label>
                        </div>
                      </section>

                      <!-- Terminal Section -->
                      <section>
                        <h3 class="text-lg font-medium text-gray-200 mb-4">Terminal</h3>

                        <div class="space-y-4">
                          <!-- Default Shell -->
                          <div>
                            <label class="block text-gray-300 mb-2">Default Shell</label>
                            <input
                              type="text"
                              .value=${this.settings.default_shell || ''}
                              @input=${(e: Event) =>
                                this.updateSetting(
                                  'default_shell',
                                  (e.target as HTMLInputElement).value || undefined
                                )}
                              placeholder="Leave empty for system default"
                              class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                          </div>

                          <!-- Default Working Directory -->
                          <div>
                            <label class="block text-gray-300 mb-2"
                              >Default Working Directory</label
                            >
                            <input
                              type="text"
                              .value=${this.settings.default_working_directory || ''}
                              @input=${(e: Event) =>
                                this.updateSetting(
                                  'default_working_directory',
                                  (e.target as HTMLInputElement).value || undefined
                                )}
                              placeholder="Leave empty for home directory"
                              class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                          </div>

                          <!-- Scrollback Lines -->
                          <div>
                            <label class="block text-gray-300 mb-2">Scrollback Lines</label>
                            <input
                              type="number"
                              .value=${this.settings.scrollback_lines}
                              @input=${(e: Event) =>
                                this.updateSetting(
                                  'scrollback_lines',
                                  parseInt((e.target as HTMLInputElement).value) || 10000
                                )}
                              min="100"
                              max="100000"
                              class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                          </div>
                        </div>
                      </section>

                      <!-- Appearance Section -->
                      <section>
                        <h3 class="text-lg font-medium text-gray-200 mb-4">Appearance</h3>

                        <div class="space-y-4">
                          <!-- Theme -->
                          <div>
                            <label class="block text-gray-300 mb-2">Theme</label>
                            <select
                              .value=${this.settings.theme}
                              @change=${(e: Event) =>
                                this.updateSetting('theme', (e.target as HTMLSelectElement).value)}
                              class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            >
                              <option value="dark">Dark</option>
                              <option value="light">Light</option>
                            </select>
                          </div>

                          <!-- Font Family -->
                          <div>
                            <label class="block text-gray-300 mb-2">Font Family</label>
                            <input
                              type="text"
                              .value=${this.settings.font_family}
                              @input=${(e: Event) =>
                                this.updateSetting(
                                  'font_family',
                                  (e.target as HTMLInputElement).value
                                )}
                              class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                          </div>

                          <!-- Font Size -->
                          <div>
                            <label class="block text-gray-300 mb-2">Font Size</label>
                            <input
                              type="number"
                              .value=${this.settings.font_size}
                              @input=${(e: Event) =>
                                this.updateSetting(
                                  'font_size',
                                  parseInt((e.target as HTMLInputElement).value) || 14
                                )}
                              min="8"
                              max="32"
                              class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                          </div>

                          <!-- Cursor Style -->
                          <div>
                            <label class="block text-gray-300 mb-2">Cursor Style</label>
                            <select
                              .value=${this.settings.cursor_style}
                              @change=${(e: Event) =>
                                this.updateSetting(
                                  'cursor_style',
                                  (e.target as HTMLSelectElement).value
                                )}
                              class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            >
                              <option value="block">Block</option>
                              <option value="underline">Underline</option>
                              <option value="bar">Bar</option>
                            </select>
                          </div>

                          <!-- Cursor Blink -->
                          <label class="flex items-center justify-between">
                            <span class="text-gray-300">Cursor Blink</span>
                            <input
                              type="checkbox"
                              .checked=${this.settings.cursor_blink}
                              @change=${(e: Event) =>
                                this.updateSetting(
                                  'cursor_blink',
                                  (e.target as HTMLInputElement).checked
                                )}
                              class="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
                            />
                          </label>
                        </div>
                      </section>

                      <!-- Error Message -->
                      ${this.error
                        ? html`
                            <div
                              class="bg-red-900 bg-opacity-50 border border-red-700 text-red-200 px-4 py-3 rounded"
                            >
                              ${this.error}
                            </div>
                          `
                        : ''}

                      <!-- Success Message -->
                      <div
                        class="success-message hidden bg-green-900 bg-opacity-50 border border-green-700 text-green-200 px-4 py-3 rounded"
                      >
                        Settings saved successfully
                      </div>
                    </div>
                  `
                : html` <div class="p-8 text-center text-gray-400">Failed to load settings</div> `}
          </div>

          <!-- Footer -->
          <div class="bg-gray-800 px-6 py-4 border-t border-gray-700 flex justify-end space-x-3">
            <button
              @click=${this.handleClose}
              class="px-4 py-2 text-gray-300 hover:text-gray-100 transition-colors"
            >
              Cancel
            </button>
            <button
              @click=${this.saveSettings}
              ?disabled=${this.saving || !this.settings}
              class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              ${this.saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    `;
  }
}
