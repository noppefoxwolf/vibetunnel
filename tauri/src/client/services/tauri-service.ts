import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
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

export interface NgrokTunnel {
  url: string;
  port: number;
  status: string;
}

export interface Settings {
  launch_at_login: boolean;
  show_in_dock: boolean;
  default_shell?: string;
  default_working_directory?: string;
  theme: string;
  font_family: string;
  font_size: number;
  cursor_style: string;
  cursor_blink: boolean;
  scrollback_lines: number;
  env_vars: Record<string, string>;
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
    await getCurrentWindow().hide();
  }

  static async minimizeWindow(): Promise<void> {
    if (!isTauri()) {
      return;
    }
    await getCurrentWindow().minimize();
  }

  static async maximizeWindow(): Promise<void> {
    if (!isTauri()) {
      return;
    }
    await getCurrentWindow().toggleMaximize();
  }

  static async closeWindow(): Promise<void> {
    if (!isTauri()) {
      return;
    }
    await getCurrentWindow().close();
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

    const unlisten = getCurrentWindow().onCloseRequested((event) => {
      event.preventDefault();
      callback();
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }

  // ngrok integration
  static async startNgrokTunnel(port: number, authToken?: string): Promise<NgrokTunnel> {
    if (!isTauri()) {
      throw new Error('Not running in Tauri environment');
    }
    return await invoke<NgrokTunnel>('start_ngrok_tunnel', { port, authToken });
  }

  static async stopNgrokTunnel(): Promise<void> {
    if (!isTauri()) {
      return;
    }
    return await invoke('stop_ngrok_tunnel');
  }

  static async getNgrokStatus(): Promise<NgrokTunnel | null> {
    if (!isTauri()) {
      return null;
    }
    return await invoke<NgrokTunnel | null>('get_ngrok_status');
  }

  // Open native settings window
  static async openSettings(): Promise<void> {
    if (!isTauri()) {
      return;
    }
    // The backend will handle opening the settings window
    // via the tray menu event handler
    return await invoke('open_settings_window');
  }

  // Settings management
  static async getSettings(): Promise<Settings> {
    if (!isTauri()) {
      // Return default settings for web
      return {
        launch_at_login: false,
        show_in_dock: false,
        theme: 'dark',
        font_family: 'JetBrains Mono, Monaco, Consolas, monospace',
        font_size: 14,
        cursor_style: 'block',
        cursor_blink: true,
        scrollback_lines: 10000,
        env_vars: {},
      };
    }
    return await invoke<Settings>('get_settings');
  }

  static async saveSettings(settings: Settings): Promise<void> {
    if (!isTauri()) {
      return;
    }
    return await invoke('save_settings', { settings });
  }

  static async setAutoLaunch(enabled: boolean): Promise<void> {
    if (!isTauri()) {
      return;
    }
    return await invoke('set_auto_launch', { enabled });
  }

  static async getAutoLaunch(): Promise<boolean> {
    if (!isTauri()) {
      return false;
    }
    return await invoke<boolean>('get_auto_launch');
  }

  // Terminal detection
  static async detectSystemTerminals(): Promise<{
    default: { name: string; path: string; available: boolean } | null;
    available: Array<{ name: string; path: string; available: boolean }>;
  }> {
    if (!isTauri()) {
      return { default: null, available: [] };
    }
    return await invoke('detect_system_terminals');
  }

  static async getDefaultShell(): Promise<string> {
    if (!isTauri()) {
      return '/bin/bash';
    }
    return await invoke<string>('get_default_shell');
  }

  // CLI installation
  static async installCli(): Promise<{
    installed: boolean;
    path: string;
    message: string;
  }> {
    if (!isTauri()) {
      throw new Error('Not running in Tauri environment');
    }
    return await invoke('install_cli');
  }

  static async uninstallCli(): Promise<{
    installed: boolean;
    path: string;
    message: string;
  }> {
    if (!isTauri()) {
      throw new Error('Not running in Tauri environment');
    }
    return await invoke('uninstall_cli');
  }

  static async checkCliInstalled(): Promise<boolean> {
    if (!isTauri()) {
      return false;
    }
    return await invoke<boolean>('check_cli_installed');
  }
}
