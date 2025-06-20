import { LitElement, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { TauriService, isTauri } from '../services/tauri-service.js';
import './vibe-logo.js';

interface OnboardingStep {
  id: string;
  title: string;
  content: () => any;
  action?: () => Promise<void>;
  actionLabel?: string;
}

@customElement('onboarding-flow')
export class OnboardingFlow extends LitElement {
  // Disable shadow DOM to use Tailwind
  createRenderRoot() {
    return this;
  }

  @property({ type: Function }) onComplete?: () => void;
  @state() private currentStep = 0;
  @state() private isProcessing = false;
  @state() private terminalDetected = false;
  @state() private autoLaunchEnabled = false;
  @state() private cliInstalled = false;

  private steps: OnboardingStep[] = [
    {
      id: 'welcome',
      title: 'Welcome to VibeTunnel',
      content: () => html`
        <div class="text-center">
          <div class="mb-8 transform scale-150">
            <vibe-logo></vibe-logo>
          </div>
          <h2 class="text-2xl font-bold text-gray-100 mb-4">Your Terminal, Everywhere</h2>
          <p class="text-lg text-gray-400 mb-6">
            VibeTunnel lets you create, manage, and share terminal sessions across platforms
          </p>
          <div class="grid grid-cols-3 gap-4 max-w-2xl mx-auto">
            <div class="text-center p-4">
              <div class="text-3xl mb-2">🚀</div>
              <p class="text-sm text-gray-400">Native Performance</p>
            </div>
            <div class="text-center p-4">
              <div class="text-3xl mb-2">🌐</div>
              <p class="text-sm text-gray-400">Remote Access</p>
            </div>
            <div class="text-center p-4">
              <div class="text-3xl mb-2">🔒</div>
              <p class="text-sm text-gray-400">Secure Sharing</p>
            </div>
          </div>
        </div>
      `,
    },
    {
      id: 'terminal-setup',
      title: 'Terminal Detection',
      content: () => html`
        <div class="text-center">
          <div class="text-5xl mb-6">🖥️</div>
          <h2 class="text-2xl font-bold text-gray-100 mb-4">Setting Up Your Terminal</h2>
          ${this.terminalDetected
            ? html`
                <div class="bg-green-900/30 border border-green-700 rounded-lg p-4 mb-6">
                  <p class="text-green-400">✓ Terminal detected successfully!</p>
                </div>
              `
            : html`
                <p class="text-lg text-gray-400 mb-6">
                  Let's detect your default terminal application
                </p>
              `}
          <div class="text-left bg-gray-900 rounded-lg p-6 max-w-lg mx-auto">
            <h3 class="text-lg font-semibold text-gray-200 mb-3">Supported Terminals:</h3>
            <ul class="space-y-2 text-gray-400">
              <li class="flex items-center">
                <span class="text-green-400 mr-2">✓</span>
                Terminal.app (macOS)
              </li>
              <li class="flex items-center">
                <span class="text-green-400 mr-2">✓</span>
                iTerm2
              </li>
              <li class="flex items-center">
                <span class="text-green-400 mr-2">✓</span>
                Windows Terminal
              </li>
              <li class="flex items-center">
                <span class="text-green-400 mr-2">✓</span>
                GNOME Terminal
              </li>
              <li class="flex items-center">
                <span class="text-green-400 mr-2">✓</span>
                And many more...
              </li>
            </ul>
          </div>
        </div>
      `,
      action: async () => {
        if (isTauri()) {
          try {
            const terminals = await TauriService.detectSystemTerminals();
            if (terminals.default || terminals.available.length > 0) {
              this.terminalDetected = true;
            }
          } catch (error) {
            console.error('Failed to detect terminal:', error);
          }
        }
      },
      actionLabel: 'Detect Terminal',
    },
    {
      id: 'cli-install',
      title: 'Command Line Tool',
      content: () => html`
        <div class="text-center">
          <div class="text-5xl mb-6">⌨️</div>
          <h2 class="text-2xl font-bold text-gray-100 mb-4">Install CLI Tool</h2>
          ${this.cliInstalled
            ? html`
                <div class="bg-green-900/30 border border-green-700 rounded-lg p-4 mb-6">
                  <p class="text-green-400">✓ CLI tool installed successfully!</p>
                </div>
              `
            : html`
                <p class="text-lg text-gray-400 mb-6">
                  Install the 'vt' command for quick terminal access
                </p>
              `}
          <div class="bg-gray-900 rounded-lg p-6 max-w-lg mx-auto">
            <h3 class="text-lg font-semibold text-gray-200 mb-3">What you can do:</h3>
            <div class="space-y-3">
              <div class="bg-gray-800 rounded p-3 font-mono text-sm text-gray-300">
                <span class="text-green-400">$</span> vt new
                <span class="text-gray-500"># Create new session</span>
              </div>
              <div class="bg-gray-800 rounded p-3 font-mono text-sm text-gray-300">
                <span class="text-green-400">$</span> vt list
                <span class="text-gray-500"># List all sessions</span>
              </div>
              <div class="bg-gray-800 rounded p-3 font-mono text-sm text-gray-300">
                <span class="text-green-400">$</span> vt connect abc123
                <span class="text-gray-500"># Connect to session</span>
              </div>
            </div>
          </div>
        </div>
      `,
      action: async () => {
        if (isTauri()) {
          try {
            const result = await TauriService.installCli();
            if (result.installed) {
              this.cliInstalled = true;
            }
          } catch (error) {
            console.error('Failed to install CLI:', error);
          }
        }
      },
      actionLabel: 'Install CLI',
    },
    {
      id: 'auto-launch',
      title: 'Auto Launch',
      content: () => html`
        <div class="text-center">
          <div class="text-5xl mb-6">🚀</div>
          <h2 class="text-2xl font-bold text-gray-100 mb-4">Launch at Startup</h2>
          <p class="text-lg text-gray-400 mb-6">Start VibeTunnel automatically when you log in</p>
          <div class="bg-gray-900 rounded-lg p-6 max-w-lg mx-auto">
            <label class="flex items-center justify-between cursor-pointer group">
              <div class="text-left">
                <p class="text-gray-200 font-medium">Enable auto-launch</p>
                <p class="text-sm text-gray-500">VibeTunnel will start minimized in the tray</p>
              </div>
              <div class="relative">
                <input
                  type="checkbox"
                  class="sr-only peer"
                  .checked=${this.autoLaunchEnabled}
                  @change=${this.handleAutoLaunchToggle}
                />
                <div
                  class="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"
                ></div>
              </div>
            </label>
          </div>
          <p class="text-sm text-gray-500 mt-6">You can change this later in Settings</p>
        </div>
      `,
    },
    {
      id: 'complete',
      title: 'All Set!',
      content: () => html`
        <div class="text-center">
          <div class="text-6xl mb-6">🎉</div>
          <h2 class="text-2xl font-bold text-gray-100 mb-4">You're Ready to Go!</h2>
          <p class="text-lg text-gray-400 mb-8">VibeTunnel is set up and ready to use</p>
          <div class="bg-gray-900 rounded-lg p-6 max-w-lg mx-auto mb-8">
            <h3 class="text-lg font-semibold text-gray-200 mb-3">Quick Tips:</h3>
            <ul class="space-y-2 text-left text-gray-400">
              <li>
                • Press <kbd class="px-2 py-1 bg-gray-800 rounded text-sm">⌘T</kbd> to create a new
                terminal
              </li>
              <li>• Click the tray icon to access VibeTunnel anytime</li>
              <li>• Use the 'vt' command from any terminal</li>
              <li>• Check Settings to customize your experience</li>
            </ul>
          </div>
        </div>
      `,
    },
  ];

  private async handleAutoLaunchToggle(e: Event) {
    const checkbox = e.target as HTMLInputElement;
    this.autoLaunchEnabled = checkbox.checked;

    if (isTauri()) {
      try {
        await TauriService.invoke('set_auto_launch', { enabled: this.autoLaunchEnabled });
      } catch (error) {
        console.error('Failed to set auto launch:', error);
        this.autoLaunchEnabled = !this.autoLaunchEnabled;
      }
    }
  }

  private async handleNext() {
    const currentStepData = this.steps[this.currentStep];

    if (currentStepData.action && !this.isProcessing) {
      this.isProcessing = true;
      try {
        await currentStepData.action();
      } finally {
        this.isProcessing = false;
      }
    }

    if (this.currentStep < this.steps.length - 1) {
      this.currentStep++;
    } else {
      this.handleComplete();
    }
  }

  private handleBack() {
    if (this.currentStep > 0) {
      this.currentStep--;
    }
  }

  private handleSkip() {
    this.handleComplete();
  }

  private handleComplete() {
    // Save onboarding completion status
    if (isTauri()) {
      localStorage.setItem('vibetunnel-onboarding-complete', 'true');
    }

    if (this.onComplete) {
      this.onComplete();
    }
  }

  render() {
    const step = this.steps[this.currentStep];
    const isLastStep = this.currentStep === this.steps.length - 1;
    const hasAction = !!step.action;

    return html`
      <div class="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50">
        <div
          class="bg-gray-950 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden"
        >
          <!-- Progress Bar -->
          <div class="h-1 bg-gray-800">
            <div
              class="h-full bg-gradient-to-r from-blue-600 to-blue-500 transition-all duration-300"
              style="width: ${((this.currentStep + 1) / this.steps.length) * 100}%"
            ></div>
          </div>

          <!-- Content -->
          <div class="p-12">
            <!-- Skip button -->
            ${!isLastStep
              ? html`
                  <button
                    @click=${this.handleSkip}
                    class="absolute top-6 right-6 text-gray-500 hover:text-gray-300 transition-colors"
                  >
                    Skip
                  </button>
                `
              : ''}

            <!-- Step Content -->
            <div class="min-h-[400px] flex flex-col justify-center">${step.content()}</div>

            <!-- Navigation -->
            <div class="flex justify-between items-center mt-12">
              <button
                @click=${this.handleBack}
                ?disabled=${this.currentStep === 0}
                class="px-6 py-2 text-gray-400 hover:text-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Back
              </button>

              <!-- Step Indicators -->
              <div class="flex space-x-2">
                ${this.steps.map(
                  (_, index) => html`
                    <div
                      class="w-2 h-2 rounded-full transition-all duration-300 ${index ===
                      this.currentStep
                        ? 'w-8 bg-blue-500'
                        : index < this.currentStep
                          ? 'bg-blue-700'
                          : 'bg-gray-700'}"
                    ></div>
                  `
                )}
              </div>

              <button
                @click=${this.handleNext}
                ?disabled=${this.isProcessing}
                class="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
              >
                ${this.isProcessing
                  ? html`
                      <svg
                        class="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          class="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          stroke-width="4"
                        ></circle>
                        <path
                          class="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        ></path>
                      </svg>
                      Processing...
                    `
                  : hasAction && !this.terminalDetected && !this.cliInstalled
                    ? step.actionLabel
                    : isLastStep
                      ? 'Get Started'
                      : 'Next'}
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }
}
