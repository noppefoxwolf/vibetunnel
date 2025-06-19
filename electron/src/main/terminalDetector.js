const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

class TerminalDetector {
  static getAvailableTerminals() {
    const platform = process.platform;
    
    switch (platform) {
    case 'darwin':
      return this.getMacTerminals();
    case 'win32':
      return this.getWindowsTerminals();
    case 'linux':
      return this.getLinuxTerminals();
    default:
      return [];
    }
  }

  static getMacTerminals() {
    const terminals = [];
    
    // Check for common macOS terminals
    const terminalApps = [
      {
        name: 'Terminal',
        path: '/System/Applications/Utilities/Terminal.app',
        bundleId: 'com.apple.Terminal',
        command: 'open -a Terminal'
      },
      {
        name: 'iTerm2',
        path: '/Applications/iTerm.app',
        bundleId: 'com.googlecode.iterm2',
        command: 'open -a iTerm'
      },
      {
        name: 'Hyper',
        path: '/Applications/Hyper.app',
        bundleId: 'co.zeit.hyper',
        command: 'open -a Hyper'
      },
      {
        name: 'Alacritty',
        path: '/Applications/Alacritty.app',
        bundleId: 'org.alacritty',
        command: 'open -a Alacritty'
      },
      {
        name: 'Warp',
        path: '/Applications/Warp.app',
        bundleId: 'dev.warp.Warp-Stable',
        command: 'open -a Warp'
      },
      {
        name: 'Kitty',
        path: '/Applications/kitty.app',
        bundleId: 'net.kovidgoyal.kitty',
        command: 'open -a kitty'
      }
    ];
    
    terminalApps.forEach(terminal => {
      if (fs.existsSync(terminal.path)) {
        terminals.push({
          name: terminal.name,
          path: terminal.path,
          command: terminal.command,
          available: true
        });
      }
    });
    
    return terminals;
  }

  static getWindowsTerminals() {
    const terminals = [];
    
    // Windows Terminal (if installed)
    const wtPath = path.join(
      process.env.LOCALAPPDATA,
      'Microsoft',
      'WindowsApps',
      'wt.exe'
    );
    
    if (fs.existsSync(wtPath)) {
      terminals.push({
        name: 'Windows Terminal',
        path: wtPath,
        command: 'wt.exe',
        available: true
      });
    }
    
    // PowerShell Core
    try {
      exec('where pwsh.exe', { windowsHide: true }, (error, stdout) => {
        if (!error && stdout) {
          terminals.push({
            name: 'PowerShell Core',
            path: stdout.trim(),
            command: 'pwsh.exe',
            available: true
          });
        }
      });
    } catch (e) {
      // Not found
    }
    
    // Windows PowerShell (always available)
    terminals.push({
      name: 'Windows PowerShell',
      path: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
      command: 'powershell.exe',
      available: true
    });
    
    // Command Prompt (always available)
    terminals.push({
      name: 'Command Prompt',
      path: 'C:\\Windows\\System32\\cmd.exe',
      command: 'cmd.exe',
      available: true
    });
    
    // Git Bash
    const gitBashPaths = [
      'C:\\Program Files\\Git\\git-bash.exe',
      'C:\\Program Files (x86)\\Git\\git-bash.exe'
    ];
    
    gitBashPaths.forEach(gitPath => {
      if (fs.existsSync(gitPath)) {
        terminals.push({
          name: 'Git Bash',
          path: gitPath,
          command: gitPath,
          available: true
        });
      }
    });
    
    // ConEmu
    const conEmuPath = path.join(process.env.ProgramFiles, 'ConEmu', 'ConEmu64.exe');
    if (fs.existsSync(conEmuPath)) {
      terminals.push({
        name: 'ConEmu',
        path: conEmuPath,
        command: conEmuPath,
        available: true
      });
    }
    
    // Cmder
    const cmderPaths = [
      path.join(os.homedir(), 'cmder', 'Cmder.exe'),
      'C:\\tools\\cmder\\Cmder.exe'
    ];
    
    cmderPaths.forEach(cmderPath => {
      if (fs.existsSync(cmderPath)) {
        terminals.push({
          name: 'Cmder',
          path: cmderPath,
          command: cmderPath,
          available: true
        });
      }
    });
    
    return terminals;
  }

  static getLinuxTerminals() {
    const terminals = [];
    
    // Common Linux terminals
    const terminalCommands = [
      { name: 'GNOME Terminal', command: 'gnome-terminal' },
      { name: 'Konsole', command: 'konsole' },
      { name: 'xterm', command: 'xterm' },
      { name: 'rxvt', command: 'rxvt' },
      { name: 'Terminator', command: 'terminator' },
      { name: 'Tilix', command: 'tilix' },
      { name: 'Alacritty', command: 'alacritty' },
      { name: 'Kitty', command: 'kitty' },
      { name: 'Hyper', command: 'hyper' },
      { name: 'Cool Retro Term', command: 'cool-retro-term' }
    ];
    
    terminalCommands.forEach(terminal => {
      try {
        exec(`which ${terminal.command}`, (error, stdout) => {
          if (!error && stdout) {
            terminals.push({
              name: terminal.name,
              path: stdout.trim(),
              command: terminal.command,
              available: true
            });
          }
        });
      } catch (e) {
        // Not found
      }
    });
    
    // Check for desktop environment specific terminals
    const desktopEnv = process.env.XDG_CURRENT_DESKTOP || process.env.DESKTOP_SESSION;
    
    if (desktopEnv) {
      if (desktopEnv.toLowerCase().includes('gnome')) {
        terminals.unshift({
          name: 'GNOME Terminal',
          command: 'gnome-terminal',
          preferred: true,
          available: true
        });
      } else if (desktopEnv.toLowerCase().includes('kde')) {
        terminals.unshift({
          name: 'Konsole',
          command: 'konsole',
          preferred: true,
          available: true
        });
      } else if (desktopEnv.toLowerCase().includes('xfce')) {
        terminals.unshift({
          name: 'XFCE Terminal',
          command: 'xfce4-terminal',
          preferred: true,
          available: true
        });
      }
    }
    
    return terminals;
  }

  static async openTerminal(terminalCommand, options = {}) {
    const platform = process.platform;
    const { cwd, sessionId, serverPort } = options;
    
    // Build the vt command
    const vtCommand = `vt ${sessionId}`;
    
    if (platform === 'darwin') {
      // macOS: Use AppleScript or open command
      const script = `
        tell application "${terminalCommand}"
          activate
          ${cwd ? `do script "cd ${cwd} && ${vtCommand}"` : `do script "${vtCommand}"`}
        end tell
      `;
      
      exec(`osascript -e '${script}'`, (error) => {
        if (error) {
          console.error('Failed to open terminal:', error);
        }
      });
    } else if (platform === 'win32') {
      // Windows: Use start command or direct execution
      const command = cwd 
        ? `cd /d "${cwd}" && ${vtCommand}`
        : vtCommand;
      
      if (terminalCommand.includes('wt.exe')) {
        // Windows Terminal
        exec(`wt.exe -d "${cwd || process.cwd()}" cmd /k "${vtCommand}"`, { windowsHide: false });
      } else if (terminalCommand.includes('powershell')) {
        // PowerShell
        exec(`start ${terminalCommand} -NoExit -Command "cd '${cwd || process.cwd()}'; ${vtCommand}"`, { windowsHide: false });
      } else {
        // Command Prompt
        exec(`start ${terminalCommand} /k "cd /d ${cwd || process.cwd()} && ${vtCommand}"`, { windowsHide: false });
      }
    } else {
      // Linux: Use the terminal command with appropriate flags
      let command = terminalCommand;
      
      if (terminalCommand.includes('gnome-terminal')) {
        command = `${terminalCommand} --working-directory="${cwd || process.cwd()}" -- bash -c "${vtCommand}; exec bash"`;
      } else if (terminalCommand.includes('konsole')) {
        command = `${terminalCommand} --workdir "${cwd || process.cwd()}" -e bash -c "${vtCommand}; exec bash"`;
      } else if (terminalCommand.includes('xterm')) {
        command = `${terminalCommand} -e "cd ${cwd || process.cwd()} && ${vtCommand}; bash"`;
      } else {
        // Generic fallback
        command = `${terminalCommand} -e "${vtCommand}"`;
      }
      
      exec(command, { detached: true }, (error) => {
        if (error) {
          console.error('Failed to open terminal:', error);
        }
      });
    }
  }
}

module.exports = TerminalDetector;