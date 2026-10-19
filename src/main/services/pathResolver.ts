import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * PATH RESOLUTION SYSTEM FOR REA STUDIO
 * 
 * In packaged desktop distributions (macOS .app / Windows NSIS / Linux AppImage),
 * applications launched from the desktop shell or window manager often do NOT inherit
 * the user's terminal shell profile ($PATH).
 * 
 * This module implements a deterministic 3-tier lookup order:
 *   Tier 1: Configured Path (user override in Settings -> reaCommandOverride)
 *   Tier 2: System PATH (process.env.PATH)
 *   Tier 3: Common OS Installation Directories (Homebrew, NVM, Program Files, Volta, ASDF, etc.)
 */

export interface ResolvedCommand {
  command: string;
  args: string[];
  resolvedPath: string | null;
  enrichedPath: string;
  isAvailable: boolean;
  error?: string;
  fixHint?: string;
}

/**
 * Returns common installation directories for Node/npm/npx and REA on the current OS.
 */
export function getCommonInstallDirs(platform: NodeJS.Platform = process.platform): string[] {
  const dirs: string[] = [];
  const home = os.homedir();

  if (platform === 'win32') {
    // 1. Program Files
    const programFiles = process.env['ProgramFiles'] || 'C:\\Program Files';
    const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    dirs.push(path.join(programFiles, 'nodejs'));
    dirs.push(path.join(programFilesX86, 'nodejs'));

    // 2. AppData Roaming (Global npm prefix)
    const appData = process.env['APPDATA'] || path.join(home, 'AppData', 'Roaming');
    dirs.push(path.join(appData, 'npm'));

    // 3. Local AppData (NVM-windows, Volta, Scoop, etc.)
    const localAppData = process.env['LOCALAPPDATA'] || path.join(home, 'AppData', 'Local');
    dirs.push(path.join(localAppData, 'Programs', 'nodejs'));
    dirs.push(path.join(localAppData, 'npm'));
    dirs.push(path.join(localAppData, 'Volta', 'bin'));

    // 4. NVM for Windows default locations
    if (process.env['NVM_HOME']) dirs.push(process.env['NVM_HOME']);
    if (process.env['NVM_SYMLINK']) dirs.push(process.env['NVM_SYMLINK']);
    dirs.push('C:\\nvm4w\\nodejs');
  } else if (platform === 'darwin') {
    // 1. Homebrew (Apple Silicon & Intel)
    dirs.push('/opt/homebrew/bin');
    dirs.push('/usr/local/bin');
    dirs.push('/usr/bin');
    dirs.push('/bin');

    // 2. Volta / ASDF / Proto
    dirs.push(path.join(home, '.volta', 'bin'));
    dirs.push(path.join(home, '.asdf', 'shims'));
    dirs.push(path.join(home, '.proto', 'bin'));
    dirs.push(path.join(home, '.local', 'bin'));

    // 3. NVM node versions
    const nvmVersionsDir = path.join(home, '.nvm', 'versions', 'node');
    if (fs.existsSync(nvmVersionsDir)) {
      try {
        const versions = fs.readdirSync(nvmVersionsDir).sort().reverse();
        for (const v of versions) {
          dirs.push(path.join(nvmVersionsDir, v, 'bin'));
        }
      } catch {
        // ignore read error
      }
    }
  } else {
    // Linux
    dirs.push('/usr/local/bin');
    dirs.push('/usr/bin');
    dirs.push('/bin');
    dirs.push('/snap/bin');
    dirs.push(path.join(home, '.local', 'bin'));
    dirs.push(path.join(home, '.volta', 'bin'));
    dirs.push(path.join(home, '.asdf', 'shims'));

    // NVM node versions
    const nvmVersionsDir = path.join(home, '.nvm', 'versions', 'node');
    if (fs.existsSync(nvmVersionsDir)) {
      try {
        const versions = fs.readdirSync(nvmVersionsDir).sort().reverse();
        for (const v of versions) {
          dirs.push(path.join(nvmVersionsDir, v, 'bin'));
        }
      } catch {
        // ignore
      }
    }
  }

  // Deduplicate and filter existing directories
  return Array.from(new Set(dirs.filter((d) => {
    try {
      return fs.existsSync(d);
    } catch {
      return false;
    }
  })));
}

/**
 * Generates an enriched PATH environment string containing current process.env.PATH
 * plus all discovered common install directories.
 */
export function getEnrichedPath(platform: NodeJS.Platform = process.platform): string {
  const currentPath = process.env.PATH || '';
  const commonDirs = getCommonInstallDirs(platform);
  const delimiter = platform === 'win32' ? ';' : ':';

  const parts = currentPath.split(delimiter).filter(Boolean);
  for (const dir of commonDirs) {
    if (!parts.includes(dir)) {
      parts.push(dir);
    }
  }

  return parts.join(delimiter);
}

/**
 * Searches for an executable filename across:
 * 1. An explicitly passed full path
 * 2. process.env.PATH
 * 3. Common installation paths
 */
export function findExecutable(
  binaryName: string,
  platform: NodeJS.Platform = process.platform
): string | null {
  // If absolute path provided, check directly
  if (path.isAbsolute(binaryName)) {
    if (fs.existsSync(binaryName)) return binaryName;
    return null;
  }

  const isWin = platform === 'win32';
  const extensions = isWin
    ? (process.env.PATHEXT || '.EXE;.CMD;.BAT').split(';').map((e) => e.toLowerCase())
    : [''];

  const searchDirs: string[] = [];

  // Add process.env.PATH directories
  const currentPath = process.env.PATH || '';
  const delimiter = isWin ? ';' : ':';
  for (const d of currentPath.split(delimiter).filter(Boolean)) {
    searchDirs.push(d);
  }

  // Add common install directories
  for (const d of getCommonInstallDirs(platform)) {
    if (!searchDirs.includes(d)) {
      searchDirs.push(d);
    }
  }

  for (const dir of searchDirs) {
    for (const ext of extensions) {
      const full = path.join(
        dir,
        binaryName + (binaryName.toLowerCase().endsWith(ext) ? '' : ext)
      );
      try {
        if (fs.existsSync(full)) {
          return full;
        }
      } catch {
        // ignore
      }
    }
  }

  return null;
}

/**
 * Resolves the command and arguments for spawning the REA MCP server.
 * 
 * Lookup Order:
 * 1. User-configured override (`settings.reaCommandOverride`)
 * 2. System PATH
 * 3. Common install locations
 */
export function resolveReaMcpCommand(
  overrideCommand?: string,
  platform: NodeJS.Platform = process.platform
): ResolvedCommand {
  const enrichedPath = getEnrichedPath(platform);
  const isWin = platform === 'win32';

  // Tier 1: Configured Path Override
  if (overrideCommand && overrideCommand.trim()) {
    const parts = overrideCommand.trim().split(/\s+/);
    const cmd = parts[0];
    const args = parts.slice(1);

    const resolved = findExecutable(cmd, platform);
    return {
      command: resolved || cmd,
      args,
      resolvedPath: resolved,
      enrichedPath,
      isAvailable: resolved !== null,
      error: resolved === null ? `Configured REA override command not found: "${cmd}"` : undefined,
      fixHint: resolved === null
        ? 'Please check the file path in Settings -> REA Command Override or install the binary.'
        : undefined,
    };
  }

  // Tier 2 & 3: Standard npx or rea binary
  // Check for local or global `rea` first
  const reaPath = findExecutable('rea', platform);
  if (reaPath) {
    return {
      command: reaPath,
      args: ['mcp'],
      resolvedPath: reaPath,
      enrichedPath,
      isAvailable: true,
    };
  }

  // Fallback to npx -y rea-agents@latest mcp
  const npxName = isWin ? 'npx.cmd' : 'npx';
  const npxPath = findExecutable(npxName, platform) || findExecutable('npx', platform);

  if (npxPath) {
    if (isWin) {
      // On Windows, invoke via cmd.exe to ensure proper .cmd batch processing
      const cmdExe = process.env.ComSpec || 'cmd.exe';
      return {
        command: cmdExe,
        args: ['/d', '/c', npxPath, '-y', 'rea-agents@latest', 'mcp'],
        resolvedPath: npxPath,
        enrichedPath,
        isAvailable: true,
      };
    } else {
      return {
        command: npxPath,
        args: ['-y', 'rea-agents@latest', 'mcp'],
        resolvedPath: npxPath,
        enrichedPath,
        isAvailable: true,
      };
    }
  }

  // If neither rea nor npx is found:
  return {
    command: isWin ? 'cmd.exe' : 'npx',
    args: isWin
      ? ['/d', '/c', 'npx', '-y', 'rea-agents@latest', 'mcp']
      : ['-y', 'rea-agents@latest', 'mcp'],
    resolvedPath: null,
    enrichedPath,
    isAvailable: false,
    error: 'Node.js / npx executable could not be found.',
    fixHint:
      'REA Studio requires Node.js (v18+ or v22+) and npx to launch the REA MCP server.\n' +
      'Lookup order attempted:\n' +
      '  1. Configured REA command in Settings\n' +
      '  2. System PATH\n' +
      '  3. Common installation paths (e.g. Program Files/nodejs, /usr/local/bin, /opt/homebrew/bin)\n\n' +
      'Please install Node.js from https://nodejs.org or set your custom REA command path in Settings.',
  };
}
