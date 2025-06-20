export type Theme = 'light' | 'dark';

class ThemeService {
  private theme: Theme = 'dark';
  private listeners: Set<(theme: Theme) => void> = new Set();

  constructor() {
    this.detectTheme();
    this.setupThemeListener();
  }

  private detectTheme() {
    // Check if user has a saved preference
    const savedTheme = localStorage.getItem('vibetunnel-theme');
    if (savedTheme === 'light' || savedTheme === 'dark') {
      this.theme = savedTheme;
      return;
    }

    // Otherwise, detect system preference
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      this.theme = 'dark';
    } else {
      this.theme = 'light';
    }
  }

  private setupThemeListener() {
    if (window.matchMedia) {
      const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');
      darkModeQuery.addEventListener('change', (e) => {
        // Only auto-switch if user hasn't set a preference
        if (!localStorage.getItem('vibetunnel-theme')) {
          this.setTheme(e.matches ? 'dark' : 'light');
        }
      });
    }
  }

  getTheme(): Theme {
    return this.theme;
  }

  setTheme(theme: Theme) {
    this.theme = theme;
    this.applyTheme();
    this.notifyListeners();
  }

  saveThemePreference(theme: Theme) {
    localStorage.setItem('vibetunnel-theme', theme);
    this.setTheme(theme);
  }

  clearThemePreference() {
    localStorage.removeItem('vibetunnel-theme');
    this.detectTheme();
    this.applyTheme();
    this.notifyListeners();
  }

  private applyTheme() {
    // Apply theme class to root element
    document.documentElement.classList.remove('light', 'dark');
    document.documentElement.classList.add(this.theme);

    // Set color scheme for native elements
    document.documentElement.style.colorScheme = this.theme;
  }

  subscribe(callback: (theme: Theme) => void) {
    this.listeners.add(callback);
    // Call immediately with current theme
    callback(this.theme);

    return () => {
      this.listeners.delete(callback);
    };
  }

  private notifyListeners() {
    this.listeners.forEach((callback) => callback(this.theme));
  }
}

export const themeService = new ThemeService();
