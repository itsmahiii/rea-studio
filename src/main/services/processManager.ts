import { execFile, ChildProcess } from 'child_process';

class ProcessManager {
  private activeProcesses = new Set<ChildProcess>();

  /**
   * Run an executable safely with argument arrays (no shell), output buffer limit,
   * timeout, and process tracking for clean lifecycle termination.
   */
  public safeExecFile(
    file: string,
    args: string[],
    options: { timeout?: number; maxBuffer?: number; env?: NodeJS.ProcessEnv } = {}
  ): Promise<{ stdout: string; stderr: string }> {
    const timeout = options.timeout ?? 60_000;
    const maxBuffer = options.maxBuffer ?? 5 * 1024 * 1024; // 5MB cap
    const env = options.env;

    return new Promise((resolve, reject) => {
      const child = execFile(
        file,
        args,
        {
          timeout,
          maxBuffer,
          env,
          windowsHide: true,
        },
        (error, stdout, stderr) => {
          this.activeProcesses.delete(child);
          if (error) {
            reject(error);
          } else {
            resolve({
              stdout: String(stdout || ''),
              stderr: String(stderr || ''),
            });
          }
        }
      );

      this.activeProcesses.add(child);
    });
  }

  /**
   * Kill a process and its entire process tree to prevent orphan processes.
   */
  public killTree(child: ChildProcess): void {
    if (!child || !child.pid) return;
    this.activeProcesses.delete(child);

    try {
      if (process.platform === 'win32') {
        execFile('taskkill', ['/pid', String(child.pid), '/T', '/F'], () => {});
      } else {
        process.kill(-child.pid, 'SIGKILL');
      }
    } catch {
      try {
        child.kill('SIGKILL');
      } catch {
        // ignore
      }
    }
  }

  /**
   * Terminate all active processes tracked by REA Studio.
   */
  public killAll(): void {
    for (const child of this.activeProcesses) {
      this.killTree(child);
    }
    this.activeProcesses.clear();
  }
}

export const processManager = new ProcessManager();
