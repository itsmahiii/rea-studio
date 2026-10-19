import { dialog, BrowserWindow } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import type { TargetInfo } from '../../shared/ipc';

export interface TargetClassification {
  targetType: string;
  displayType: string;
  isDirectory: boolean;
  size?: number;
  exists: boolean;
}

/**
 * Safely read up to maxBytes from the start of a file without loading the entire
 * file into memory and strictly in read-only mode.
 */
function readHeaderSafe(filePath: string, maxBytes = 4096): Buffer {
  let fd: number | null = null;
  try {
    fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(maxBytes);
    const bytesRead = fs.readSync(fd, buf, 0, maxBytes, 0);
    return buf.subarray(0, bytesRead);
  } catch {
    return Buffer.alloc(0);
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch {
        // ignore close error
      }
    }
  }
}

/**
 * Safely check if a directory is an extracted Electron application without executing anything
 * and without following symlinks outside the directory.
 */
function isElectronAppDirectory(dirPath: string): boolean {
  try {
    const pkgPath = path.join(dirPath, 'package.json');
    if (fs.existsSync(pkgPath)) {
      // Safe check: verify realpath does not escape dirPath
      const realPkg = fs.realpathSync(pkgPath);
      const rel = path.relative(dirPath, realPkg);
      if (!rel.startsWith('..')) {
        const content = fs.readFileSync(pkgPath, 'utf-8');
        try {
          const pkg = JSON.parse(content);
          const allDeps = {
            ...pkg.dependencies,
            ...pkg.devDependencies,
            ...pkg.optionalDependencies,
            ...pkg.peerDependencies,
          };
          if (
            'electron' in allDeps ||
            'electron-builder' in allDeps ||
            'electron-forge' in allDeps ||
            '@electron/rebuild' in allDeps
          ) {
            return true;
          }
          if (pkg.scripts && typeof pkg.scripts === 'object') {
            for (const script of Object.values(pkg.scripts)) {
              if (typeof script === 'string' && script.includes('electron')) {
                return true;
              }
            }
          }
        } catch {
          // invalid JSON, ignore
        }
      }
    }

    // Check for resources directory (standard in packaged/extracted electron apps)
    const resourcesPath = path.join(dirPath, 'resources');
    if (fs.existsSync(resourcesPath)) {
      const appAsar = path.join(resourcesPath, 'app.asar');
      const appDir = path.join(resourcesPath, 'app');
      const defaultAsar = path.join(resourcesPath, 'default_app.asar');
      const electronAsar = path.join(resourcesPath, 'electron.asar');
      if (
        fs.existsSync(appAsar) ||
        fs.existsSync(appDir) ||
        fs.existsSync(defaultAsar) ||
        fs.existsSync(electronAsar)
      ) {
        return true;
      }
    }

    // Check for Electron.app (macOS) or electron.exe (Windows) or version file
    if (
      fs.existsSync(path.join(dirPath, 'Electron.app')) ||
      fs.existsSync(path.join(dirPath, 'electron.exe')) ||
      fs.existsSync(path.join(dirPath, 'version'))
    ) {
      return true;
    }
  } catch {
    // ignore filesystem errors
  }
  return false;
}

/**
 * Safely check if a directory is a JavaScript bundle / distribution directory.
 */
function isJsBundleDirectory(dirPath: string): boolean {
  try {
    const entries = fs.readdirSync(dirPath);
    for (const entry of entries) {
      const lower = entry.toLowerCase();
      if (
        lower.endsWith('.js') ||
        lower.endsWith('.mjs') ||
        lower.endsWith('.cjs') ||
        lower === 'dist' ||
        lower === 'build' ||
        lower === 'bundle.js'
      ) {
        return true;
      }
    }
  } catch {
    // ignore
  }
  return false;
}

/**
 * Perform safe, read-only target type classification.
 * Never executes the target, never follows symlinks outside the given target path,
 * and normalizes paths.
 */
export function classifyTarget(rawPath: string): TargetClassification {
  // 1. URL Target
  if (rawPath.startsWith('http://') || rawPath.startsWith('https://')) {
    return {
      targetType: 'url',
      displayType: 'Web Target / URL',
      isDirectory: false,
      exists: true,
    };
  }

  // Normalize path
  const targetPath = path.resolve(path.normalize(rawPath));

  if (!fs.existsSync(targetPath)) {
    return {
      targetType: 'unknown',
      displayType: 'Non-Existent Target',
      isDirectory: false,
      exists: false,
    };
  }

  // Symlink safety check: resolve realpath
  let stat: fs.Stats;
  try {
    const lstat = fs.lstatSync(targetPath);
    if (lstat.isSymbolicLink()) {
      const real = fs.realpathSync(targetPath);
      stat = fs.statSync(real);
    } else {
      stat = lstat;
    }
  } catch {
    return {
      targetType: 'unknown',
      displayType: 'Inaccessible Target',
      isDirectory: false,
      exists: false,
    };
  }

  const isDirectory = stat.isDirectory();
  const size = stat.size;

  // 2. Directory Classification
  if (isDirectory) {
    if (isElectronAppDirectory(targetPath)) {
      return {
        targetType: 'javascript_electron',
        displayType: 'JavaScript/Electron',
        isDirectory: true,
        size,
        exists: true,
      };
    }

    if (isJsBundleDirectory(targetPath)) {
      return {
        targetType: 'javascript_bundle',
        displayType: 'JavaScript Bundle',
        isDirectory: true,
        size,
        exists: true,
      };
    }

    return {
      targetType: 'directory',
      displayType: 'Directory',
      isDirectory: true,
      size,
      exists: true,
    };
  }

  // 3. File Classification via extension and safe magic byte inspection
  const ext = path.extname(targetPath).toLowerCase();
  const header = readHeaderSafe(targetPath, 4096);

  // ASAR Archive
  if (ext === '.asar') {
    return {
      targetType: 'javascript_electron',
      displayType: 'JavaScript/Electron',
      isDirectory: false,
      size,
      exists: true,
    };
  }

  // Android APK (ZIP with AndroidManifest.xml or .apk extension)
  if (ext === '.apk') {
    return {
      targetType: 'android_apk',
      displayType: 'Android APK',
      isDirectory: false,
      size,
      exists: true,
    };
  }

  // SQLite Database ('SQLite format 3\0')
  if (
    header.length >= 16 &&
    header.subarray(0, 16).toString('ascii') === 'SQLite format 3\0'
  ) {
    return {
      targetType: 'sqlite_database',
      displayType: 'SQLite Database',
      isDirectory: false,
      size,
      exists: true,
    };
  }

  // Packet Capture (.pcap, .pcapng or magic bytes)
  if (ext === '.pcap' || ext === '.pcapng') {
    return {
      targetType: 'packet_capture',
      displayType: 'Packet Capture',
      isDirectory: false,
      size,
      exists: true,
    };
  }
  if (header.length >= 4) {
    const magic32 = header.readUInt32BE(0);
    const magic32LE = header.readUInt32LE(0);
    // PCAP: 0xa1b2c3d4, 0xd4c3b2a1, 0x4d3c2b1a, 0x1a2b3c4d
    // PCAP-NG: 0x0a0d0d0a
    if (
      magic32 === 0xa1b2c3d4 ||
      magic32LE === 0xa1b2c3d4 ||
      magic32 === 0x4d3c2b1a ||
      magic32LE === 0x4d3c2b1a ||
      magic32 === 0x0a0d0d0a
    ) {
      return {
        targetType: 'packet_capture',
        displayType: 'Packet Capture',
        isDirectory: false,
        size,
        exists: true,
      };
    }
  }

  // Web Archive (.har, .saz)
  if (ext === '.har' || ext === '.saz') {
    return {
      targetType: 'web_archive',
      displayType: 'Web Archive (HAR/SAZ)',
      isDirectory: false,
      size,
      exists: true,
    };
  }

  // Linux ELF Binary (\x7fELF)
  if (
    header.length >= 4 &&
    header[0] === 0x7f &&
    header[1] === 0x45 &&
    header[2] === 0x4c &&
    header[3] === 0x46
  ) {
    return {
      targetType: 'native_elf',
      displayType: 'Linux ELF Binary',
      isDirectory: false,
      size,
      exists: true,
    };
  }
  if (ext === '.so' || ext === '.elf') {
    return {
      targetType: 'native_elf',
      displayType: 'Linux ELF Binary',
      isDirectory: false,
      size,
      exists: true,
    };
  }

  // macOS Mach-O Binary (0xfeedface, 0xfeedfacf, 0xcafebabe, etc.)
  if (header.length >= 4) {
    const magic32 = header.readUInt32BE(0);
    const magic32LE = header.readUInt32LE(0);
    if (
      magic32 === 0xfeedface ||
      magic32LE === 0xfeedface ||
      magic32 === 0xfeedfacf ||
      magic32LE === 0xfeedfacf ||
      magic32 === 0xcafebabe ||
      magic32LE === 0xcafebabe
    ) {
      return {
        targetType: 'native_macho',
        displayType: 'macOS Mach-O Binary',
        isDirectory: false,
        size,
        exists: true,
      };
    }
  }
  if (ext === '.dylib' || ext === '.macho') {
    return {
      targetType: 'native_macho',
      displayType: 'macOS Mach-O Binary',
      isDirectory: false,
      size,
      exists: true,
    };
  }

  // Windows PE Executable or .NET Assembly (MZ Header)
  if (header.length >= 2 && header[0] === 0x4d && header[1] === 0x5a) {
    // Check if it's a .NET assembly by checking for CLI metadata magic 'BSJB'
    const headerStr = header.toString('binary');
    const hasBsjb = headerStr.includes('BSJB');

    if (hasBsjb) {
      return {
        targetType: 'dotnet_assembly',
        displayType: '.NET Assembly',
        isDirectory: false,
        size,
        exists: true,
      };
    }

    return {
      targetType: 'native_pe',
      displayType: 'Windows PE Binary',
      isDirectory: false,
      size,
      exists: true,
    };
  }
  if (ext === '.exe' || ext === '.dll' || ext === '.sys') {
    const headerStr = header.toString('binary');
    if (headerStr.includes('BSJB')) {
      return {
        targetType: 'dotnet_assembly',
        displayType: '.NET Assembly',
        isDirectory: false,
        size,
        exists: true,
      };
    }
    return {
      targetType: 'native_pe',
      displayType: 'Windows PE Binary',
      isDirectory: false,
      size,
      exists: true,
    };
  }

  // Firmware Image (.bin, .rom, .fw, squashfs, u-boot)
  if (ext === '.bin' || ext === '.rom' || ext === '.fw') {
    return {
      targetType: 'firmware_image',
      displayType: 'Firmware Image',
      isDirectory: false,
      size,
      exists: true,
    };
  }
  if (header.length >= 4) {
    const magicStr = header.subarray(0, 4).toString('ascii');
    if (magicStr === 'hsqs' || magicStr === 'sqsh') {
      return {
        targetType: 'firmware_image',
        displayType: 'Firmware Image',
        isDirectory: false,
        size,
        exists: true,
      };
    }
  }

  // JavaScript file
  if (ext === '.js' || ext === '.mjs' || ext === '.cjs') {
    return {
      targetType: 'javascript_bundle',
      displayType: 'JavaScript Bundle',
      isDirectory: false,
      size,
      exists: true,
    };
  }

  // Fallback
  return {
    targetType: 'unknown',
    displayType: 'Generic Target',
    isDirectory: false,
    size,
    exists: true,
  };
}

export class TargetService {
  public async pickFile(
    window?: BrowserWindow,
    allowedExtensions?: string[]
  ): Promise<TargetInfo | null> {
    const filters = allowedExtensions?.length
      ? [{ name: 'Targets', extensions: allowedExtensions.map((e) => e.replace(/^\./, '')) }]
      : [
          {
            name: 'Supported Targets',
            extensions: [
              'asar',
              'apk',
              'exe',
              'dll',
              'so',
              'dylib',
              'har',
              'saz',
              'pcap',
              'pcapng',
              'sqlite',
              'db',
              'bin',
              'rom',
              'js',
            ],
          },
          { name: 'All Files', extensions: ['*'] },
        ];

    const result = await dialog.showOpenDialog(window ?? (null as unknown as BrowserWindow), {
      title: 'Pick Reverse-Engineering Target',
      properties: ['openFile'],
      filters,
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    const filePath = result.filePaths[0];
    const info = classifyTarget(filePath);
    return {
      path: filePath,
      name: path.basename(filePath),
      isDirectory: info.isDirectory,
      size: info.size,
      targetType: info.targetType,
      detectedType: info.targetType,
      displayType: info.displayType,
      exists: info.exists,
    };
  }

  public async pickDirectory(window?: BrowserWindow): Promise<TargetInfo | null> {
    const result = await dialog.showOpenDialog(window ?? (null as unknown as BrowserWindow), {
      title: 'Pick Target Folder / App Directory',
      properties: ['openDirectory'],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    const dirPath = result.filePaths[0];
    const info = classifyTarget(dirPath);
    return {
      path: dirPath,
      name: path.basename(dirPath),
      isDirectory: true,
      size: info.size,
      targetType: info.targetType,
      detectedType: info.targetType,
      displayType: info.displayType,
      exists: info.exists,
    };
  }

  public validate(targetPath: string): TargetInfo {
    const info = classifyTarget(targetPath);
    return {
      path: targetPath,
      name: path.basename(targetPath) || targetPath,
      isDirectory: info.isDirectory,
      size: info.size,
      targetType: info.targetType,
      detectedType: info.targetType,
      displayType: info.displayType,
      exists: info.exists,
    };
  }
}

export const targetService = new TargetService();
