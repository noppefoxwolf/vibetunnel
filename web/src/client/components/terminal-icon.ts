import { LitElement, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';

@customElement('terminal-icon')
export class TerminalIcon extends LitElement {
  // Disable shadow DOM to use Tailwind
  createRenderRoot() {
    return this;
  }

  @property({ type: Number }) size = 64;
  @property({ type: Boolean }) glow = true;

  render() {
    return html`
      <div class="flex items-center justify-center ${this.glow ? 'terminal-icon' : ''}">
        <svg
          width="${this.size}"
          height="${this.size}"
          viewBox="0 0 64 64"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          class="text-accent-green"
        >
          <!-- Terminal window outline -->
          <rect
            x="8"
            y="12"
            width="48"
            height="40"
            rx="4"
            stroke="currentColor"
            stroke-width="2"
            fill="rgba(0, 255, 136, 0.05)"
          />

          <!-- Terminal prompt -->
          <path
            d="M18 28l6 6-6 6"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />

          <!-- Cursor -->
          <rect x="28" y="32" width="10" height="2" fill="currentColor" class="animate-pulse" />
        </svg>
      </div>
    `;
  }
}
