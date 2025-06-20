import { TauriService } from './tauri-service.js';

class ApiService {
  private baseUrl: string | null = null;
  private initPromise: Promise<void> | null = null;

  constructor() {
    // Initialize the base URL
    this.init();
  }

  private async init(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = (async () => {
      if (TauriService.isTauri()) {
        try {
          // Get the server status to determine the port
          const status = await TauriService.getServerStatus();
          if (status.running) {
            this.baseUrl = status.url;
          } else {
            // Server not running, start it
            const newStatus = await TauriService.startServer();
            this.baseUrl = newStatus.url;
          }
        } catch (error) {
          console.error('Failed to get Tauri server status:', error);
          // Fallback to relative URLs
          this.baseUrl = '';
        }
      } else {
        // Not in Tauri, use relative URLs
        this.baseUrl = '';
      }
    })();

    return this.initPromise;
  }

  async fetch(path: string, options?: RequestInit): Promise<Response> {
    await this.init();

    const url = this.baseUrl ? `${this.baseUrl}${path}` : path;
    return fetch(url, options);
  }

  async getJSON<T>(path: string): Promise<T> {
    const response = await this.fetch(path);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  }

  async postJSON<T>(path: string, data: unknown): Promise<T> {
    const response = await this.fetch(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  }

  async delete(path: string): Promise<void> {
    const response = await this.fetch(path, {
      method: 'DELETE',
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
  }

  async createEventSource(path: string): Promise<EventSource> {
    await this.init();

    const url = this.baseUrl ? `${this.baseUrl}${path}` : path;
    return new EventSource(url);
  }

  getWebSocketUrl(path: string): string {
    if (!this.baseUrl) {
      // Use relative WebSocket URL
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${protocol}//${window.location.host}${path}`;
    }

    // Convert HTTP URL to WebSocket URL
    const wsUrl = this.baseUrl.replace(/^http/, 'ws');
    return `${wsUrl}${path}`;
  }

  reinitialize(): void {
    // Reset the initialization state to force re-fetching server status
    this.baseUrl = null;
    this.initPromise = null;
    this.init();
  }
}

// Export singleton instance
export const apiService = new ApiService();
