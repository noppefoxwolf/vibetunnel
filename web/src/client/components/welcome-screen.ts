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
      <div class="flex flex-col items-center justify-center min-h-[600px] p-12 bg-background">
        <!-- Logo -->
        <div class="mb-8">
          <vibe-logo></vibe-logo>
        </div>

        <!-- Title -->
        <div class="text-center mb-12 max-w-md">
          <h1 class="text-2xl font-light text-foreground mb-2">Welcome to VibeTunnel</h1>
          <p class="text-sm text-muted-foreground">
            Create and manage terminal sessions from one central place
          </p>
        </div>

        <!-- Action Button -->
        <button
          @click=${this.onCreateNew}
          class="px-6 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-all"
        >
          Create Your First Terminal
        </button>

        <!-- Keyboard Shortcut -->
        <div class="mt-6 text-xs text-muted-foreground">
          Press
          <kbd
            class="px-1.5 py-0.5 text-xs font-semibold text-foreground bg-secondary border border-border rounded"
            >⌘T</kbd
          >
          to create a new terminal
        </div>
      </div>
    `;
  }
}
