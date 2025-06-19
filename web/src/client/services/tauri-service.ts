import { invoke } from '@tauri-apps/api/core';
import { appWindow } from '@tauri-apps/api/window';
import { relaunch } from '@tauri-apps/plugin-process';
import { open } from '@tauri-apps/plugin-shell';
import { sendNotification } from '@tauri-apps/plugin-notification';

// Check if we're running in Tauri
export const isTauri = () => {
  return typeof window !== 'undefined' && window.__TAURI__ !== undefined;
};

// Terminal management
export interface Terminal {
  id: string;
  name: string;
  pid: number;
  rows: number;
  cols: number;
  created_at: string;
}

export interface CreateTerminalOptions {
  name?: string;
  rows?: number;
  cols?: number;
  cwd?: string;
  env?: Record<string, string>;
  shell?: string;
}

export interface ServerStatus {
  running: boolean;
  port: number;
  url: string;
}

export class TauriService {
  static async createTerminal(options: CreateTerminalOptions): Promise<Terminal> {
    if (!isTauri()) {
      throw new Error('Not running in Tauri environment');
    }
    return await invoke<Terminal>('create_terminal', { options });
  }

  static async listTerminals(): Promise<Terminal[]> {
    if (!isTauri()) {
      return [];
    }
    return await invoke<Terminal[]>('list_terminals');
  }

  static async closeTerminal(id: string): Promise<void> {
    if (!isTauri()) {
      return;
    }
    return await invoke('close_terminal', { id });
  }

  static async resizeTerminal(id: string, rows: number, cols: number): Promise<void> {
    if (!isTauri()) {
      return;
    }
    return await invoke('resize_terminal', { id, rows, cols });
  }

  static async writeToTerminal(id: string, data: Uint8Array): Promise<void> {
    if (!isTauri()) {
      return;
    }
    return await invoke('write_to_terminal', { id, data: Array.from(data) });
  }

  static async readFromTerminal(id: string): Promise<Uint8Array> {
    if (!isTauri()) {
      return new Uint8Array();
    }
    const data = await invoke<number[]>('read_from_terminal', { id });
    return new Uint8Array(data);
  }

  // Server management
  static async startServer(): Promise<ServerStatus> {
    if (!isTauri()) {
      throw new Error('Not running in Tauri environment');
    }
    return await invoke<ServerStatus>('start_server');
  }

  static async stopServer(): Promise<void> {
    if (!isTauri()) {
      return;
    }
    return await invoke('stop_server');
  }

  static async getServerStatus(): Promise<ServerStatus> {
    if (!isTauri()) {
      return { running: false, port: 0, url: '' };
    }
    return await invoke<ServerStatus>('get_server_status');
  }

  // Window management
  static async showWindow(): Promise<void> {
    if (!isTauri()) {
      return;
    }
    return await invoke('show_main_window');
  }

  static async hideWindow(): Promise<void> {
    if (!isTauri()) {
      return;
    }
    await appWindow.hide();
  }

  static async minimizeWindow(): Promise<void> {
    if (!isTauri()) {
      return;
    }
    await appWindow.minimize();
  }

  static async maximizeWindow(): Promise<void> {
    if (!isTauri()) {
      return;
    }
    await appWindow.toggleMaximize();
  }

  static async closeWindow(): Promise<void> {
    if (!isTauri()) {
      return;
    }
    await appWindow.close();
  }

  // App lifecycle
  static async quitApp(): Promise<void> {
    if (!isTauri()) {
      return;
    }
    return await invoke('quit_app');
  }

  static async relaunchApp(): Promise<void> {
    if (!isTauri()) {
      return;
    }
    await relaunch();
  }

  // Utilities
  static async openExternal(url: string): Promise<void> {
    if (!isTauri()) {
      window.open(url, '_blank');
      return;
    }
    await open(url);
  }

  static async sendNotification(title: string, body: string): Promise<void> {
    if (!isTauri()) {
      // Fallback to browser notification
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, { body });
      }
      return;
    }
    await sendNotification({ title, body });
  }

  // Window event listeners
  static onWindowClose(callback: () => void): () => void {
    if (!isTauri()) {
      return () => {};
    }

    const unlisten = appWindow.onCloseRequested((event) => {
      event.preventDefault();
      callback();
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }
}
