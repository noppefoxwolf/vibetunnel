import { LitElement, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import './vibe-logo.js';

@customElement('welcome-screen')
export class WelcomeScreen extends LitElement {
  // Disable shadow DOM to use Tailwind
  createRenderRoot() {
    return this;
  }

  @property({ type: Function }) onCreateNew?: () => void;

  render() {
    return html`
      <div class="flex flex-col items-center justify-center min-h-[400px] p-8">
        <!-- Animated Logo -->
        <div class="mb-8 transform scale-150">
          <vibe-logo></vibe-logo>
        </div>

        <!-- Welcome Message -->
        <div class="text-center mb-12 max-w-2xl">
          <h1 class="text-3xl font-bold text-gray-100 mb-4">Welcome to VibeTunnel</h1>
          <p class="text-lg text-gray-400 mb-2">Your cross-platform terminal session manager</p>
          <p class="text-sm text-gray-500">Create, manage, and share terminal sessions with ease</p>
        </div>

        <!-- Feature Grid -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12 max-w-4xl w-full">
          <div
            class="text-center p-6 bg-gray-900 rounded-lg border border-gray-800 transform transition-transform hover:scale-105"
          >
            <div class="text-4xl mb-3">🚀</div>
            <h3 class="text-lg font-semibold text-gray-200 mb-2">Fast & Native</h3>
            <p class="text-sm text-gray-400">
              Built with Rust for blazing-fast performance and native OS integration
            </p>
          </div>

          <div
            class="text-center p-6 bg-gray-900 rounded-lg border border-gray-800 transform transition-transform hover:scale-105"
          >
            <div class="text-4xl mb-3">🌐</div>
            <h3 class="text-lg font-semibold text-gray-200 mb-2">Remote Access</h3>
            <p class="text-sm text-gray-400">
              Share your terminal sessions securely with built-in ngrok integration
            </p>
          </div>

          <div
            class="text-center p-6 bg-gray-900 rounded-lg border border-gray-800 transform transition-transform hover:scale-105"
          >
            <div class="text-4xl mb-3">🎨</div>
            <h3 class="text-lg font-semibold text-gray-200 mb-2">Beautiful UI</h3>
            <p class="text-sm text-gray-400">
              Modern, clean interface with full keyboard navigation support
            </p>
          </div>
        </div>

        <!-- CTA Button -->
        <button
          @click=${this.onCreateNew}
          class="group relative px-8 py-3 font-semibold text-white bg-gradient-to-r from-blue-600 to-blue-700 rounded-lg shadow-lg transform transition-all duration-200 hover:scale-105 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900"
        >
          <span class="relative z-10">Create Your First Terminal</span>
          <div
            class="absolute inset-0 bg-gradient-to-r from-blue-700 to-blue-800 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200"
          ></div>
        </button>

        <!-- Keyboard Shortcut Hint -->
        <div class="mt-8 text-sm text-gray-500">
          <kbd class="px-2 py-1 bg-gray-800 rounded text-gray-400">⌘T</kbd>
          to create a new terminal
        </div>
      </div>
    `;
  }
}
