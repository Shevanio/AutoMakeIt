/**
 * Terminal Service
 *
 * Manages PTY (pseudo-terminal) sessions using node-pty.
 * Supports cross-platform shell detection including WSL.
 */

import * as pty from 'node-pty';
import { EventEmitter } from 'events';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from '@automakeit/utils';

const logger = createLogger('Terminal');

// Maximum scrollback buffer size (characters)
const MAX_SCROLLBACK_SIZE = 50000; // ~50KB per terminal

/**
 * Circular buffer for terminal output to prevent memory leaks
 * Maintains a fixed-size buffer and overwrites oldest data when full
 */
class CircularBuffer {
  private buffer: string[] = [];
  private head = 0;
  private size = 0;
  private readonly maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  /**
   * Add data to the buffer, overwriting oldest if full
   */
  append(data: string): void {
    const currentLength = this.getLength();

    // If adding this data would exceed max size, remove from start
    if (currentLength + data.length > this.maxSize) {
      // Calculate how much we need to remove
      const excess = currentLength + data.length - this.maxSize;
      this.trimStart(excess);
    }

    this.buffer.push(data);
    this.size++;
  }

  /**
   * Get all buffered data as a single string
   */
  getAll(): string {
    return this.buffer.join('');
  }

  /**
   * Get current buffer length in characters
   */
  getLength(): number {
    return this.buffer.reduce((sum, chunk) => sum + chunk.length, 0);
  }

  /**
   * Clear the buffer
   */
  clear(): void {
    this.buffer = [];
    this.head = 0;
    this.size = 0;
  }

  /**
   * Trim data from the start of the buffer
   */
  private trimStart(chars: number): void {
    let removed = 0;
    while (removed < chars && this.buffer.length > 0) {
      const chunk = this.buffer[0];
      if (chunk.length <= chars - removed) {
        // Remove entire chunk
        removed += chunk.length;
        this.buffer.shift();
        this.size--;
      } else {
        // Partial removal from first chunk
        this.buffer[0] = chunk.slice(chars - removed);
        removed = chars;
      }
    }
  }
}

// Session limit constants - shared with routes/settings.ts
export const MIN_MAX_SESSIONS = 1;
export const MAX_MAX_SESSIONS = 1000;

// Maximum number of concurrent terminal sessions
// Can be overridden via TERMINAL_MAX_SESSIONS environment variable
// Default set to 1000 - effectively unlimited for most use cases
let maxSessions = parseInt(process.env.TERMINAL_MAX_SESSIONS || '1000', 10);

// Throttle output to prevent overwhelming WebSocket under heavy load
// Using 4ms for responsive input feedback while still preventing flood
// Note: 16ms caused perceived input lag, especially with backspace
const OUTPUT_THROTTLE_MS = 4; // ~250fps max update rate for responsive input
const OUTPUT_BATCH_SIZE = 4096; // Smaller batches for lower latency

// Resize debounce delay - wait for prompt to settle after resize
// 150ms is enough for most prompts - longer causes sluggish feel
const RESIZE_DEBOUNCE_MS = 150;

export interface TerminalSession {
  id: string;
  pty: pty.IPty;
  cwd: string;
  createdAt: Date;
  shell: string;
  scrollbackBuffer: CircularBuffer; // Store recent output for replay on reconnect (max 50KB)
  outputBuffer: string; // Pending output to be flushed
  flushTimeout: NodeJS.Timeout | null; // Throttle timer
  resizeInProgress: boolean; // Flag to suppress scrollback during resize
  resizeDebounceTimeout: NodeJS.Timeout | null; // Resize settle timer
}

export interface TerminalOptions {
  cwd?: string;
  shell?: string;
  cols?: number;
  rows?: number;
  env?: Record<string, string>;
}

type DataCallback = (sessionId: string, data: string) => void;
type ExitCallback = (sessionId: string, exitCode: number) => void;

export class TerminalService extends EventEmitter {
  private sessions: Map<string, TerminalSession> = new Map();
  private dataCallbacks: Set<DataCallback> = new Set();
  private exitCallbacks: Set<ExitCallback> = new Set();

  /**
   * Detect the best shell for the current platform
   */
  detectShell(): { shell: string; args: string[] } {
    const platform = os.platform();

    // Check if running in WSL
    if (platform === 'linux' && this.isWSL()) {
      // In WSL, prefer the user's configured shell or bash
      const userShell = process.env.SHELL || '/bin/bash';
      if (fs.existsSync(userShell)) {
        return { shell: userShell, args: ['--login'] };
      }
      return { shell: '/bin/bash', args: ['--login'] };
    }

    switch (platform) {
      case 'win32': {
        // Windows: prefer PowerShell, fall back to cmd
        const pwsh = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
        const pwshCore = 'C:\\Program Files\\PowerShell\\7\\pwsh.exe';

        if (fs.existsSync(pwshCore)) {
          return { shell: pwshCore, args: [] };
        }
        if (fs.existsSync(pwsh)) {
          return { shell: pwsh, args: [] };
        }
        return { shell: 'cmd.exe', args: [] };
      }

      case 'darwin': {
        // macOS: prefer user's shell, then zsh, then bash
        const userShell = process.env.SHELL;
        if (userShell && fs.existsSync(userShell)) {
          return { shell: userShell, args: ['--login'] };
        }
        if (fs.existsSync('/bin/zsh')) {
          return { shell: '/bin/zsh', args: ['--login'] };
        }
        return { shell: '/bin/bash', args: ['--login'] };
      }

      case 'linux':
      default: {
        // Linux: prefer user's shell, then bash, then sh
        const userShell = process.env.SHELL;
        if (userShell && fs.existsSync(userShell)) {
          return { shell: userShell, args: ['--login'] };
        }
        if (fs.existsSync('/bin/bash')) {
          return { shell: '/bin/bash', args: ['--login'] };
        }
        return { shell: '/bin/sh', args: [] };
      }
    }
  }

  /**
   * Detect if running inside WSL (Windows Subsystem for Linux)
   */
  isWSL(): boolean {
    try {
      // Check /proc/version for Microsoft/WSL indicators
      if (fs.existsSync('/proc/version')) {
        const version = fs.readFileSync('/proc/version', 'utf-8').toLowerCase();
        return version.includes('microsoft') || version.includes('wsl');
      }
      // Check for WSL environment variable
      if (process.env.WSL_DISTRO_NAME || process.env.WSLENV) {
        return true;
      }
    } catch {
      // Ignore errors
    }
    return false;
  }

  /**
   * Get platform info for the client
   */
  getPlatformInfo(): {
    platform: string;
    isWSL: boolean;
    defaultShell: string;
    arch: string;
  } {
    const { shell } = this.detectShell();
    return {
      platform: os.platform(),
      isWSL: this.isWSL(),
      defaultShell: shell,
      arch: os.arch(),
    };
  }

  /**
   * Validate and resolve a working directory path
   * Includes security checks against:
   * - Null bytes injection
   * - Symlink attacks
   * - Path traversal via WSL UNC paths
   * - Invalid or non-existent directories
   */
  private resolveWorkingDirectory(requestedCwd?: string): string {
    const homeDir = os.homedir();

    // If no cwd requested, use home
    if (!requestedCwd) {
      return homeDir;
    }

    // Clean up the path
    let cwd = requestedCwd.trim();

    // Reject paths with null bytes (could bypass path checks)
    if (cwd.includes('\0')) {
      logger.warn(`Rejecting path with null byte: ${cwd.replace(/\0/g, '\\0')}`);
      return homeDir;
    }

    // Fix double slashes at start (but not for Windows UNC paths)
    if (cwd.startsWith('//') && !cwd.startsWith('//wsl')) {
      cwd = cwd.slice(1);
    }

    // Normalize the path to resolve . and .. segments
    // For WSL UNC paths, we need special handling to prevent bypassing security
    if (cwd.startsWith('//wsl')) {
      // WSL UNC paths are allowed but must be validated carefully
      // Format: //wsl$/DistroName/path/to/dir
      // We still check if they exist and are directories below
      logger.info(`WSL UNC path detected: ${cwd}`);
    } else {
      // Regular paths: normalize to resolve . and .. segments
      cwd = path.resolve(cwd);
    }

    // Check if path exists and is a directory
    try {
      // Use lstat to get info about the path itself (not following symlinks)
      const lstat = fs.lstatSync(cwd);

      // If it's a symlink, resolve it and validate the target
      if (lstat.isSymbolicLink()) {
        logger.info(`Resolving symlink: ${cwd}`);
        const realPath = fs.realpathSync(cwd);

        // Verify the real path is still a directory
        const realStat = fs.statSync(realPath);
        if (!realStat.isDirectory()) {
          logger.warn(
            `Symlink target is not a directory: ${cwd} -> ${realPath}, falling back to home`
          );
          return homeDir;
        }

        // Use the real path (resolved symlink) for security
        logger.info(`Symlink resolved to: ${realPath}`);
        return realPath;
      }

      // Not a symlink - check if it's a directory
      if (lstat.isDirectory()) {
        return cwd;
      }

      logger.warn(`Path exists but is not a directory: ${cwd}, falling back to home`);
      return homeDir;
    } catch (error) {
      logger.warn(
        `Working directory validation failed: ${cwd}, error: ${(error as Error).message}, falling back to home`
      );
      return homeDir;
    }
  }

  /**
   * Get current session count
   */
  getSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Get maximum allowed sessions
   */
  getMaxSessions(): number {
    return maxSessions;
  }

  /**
   * Set maximum allowed sessions (can be called dynamically)
   */
  setMaxSessions(limit: number): void {
    if (limit >= MIN_MAX_SESSIONS && limit <= MAX_MAX_SESSIONS) {
      maxSessions = limit;
      logger.info(`Max sessions limit updated to ${limit}`);
    }
  }

  /**
   * Create a new terminal session
   * Returns null if the maximum session limit has been reached
   */
  createSession(options: TerminalOptions = {}): TerminalSession | null {
    // Check session limit
    if (this.sessions.size >= maxSessions) {
      logger.error(`Max sessions (${maxSessions}) reached, refusing new session`);
      return null;
    }

    const id = `term-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

    const { shell: detectedShell, args: shellArgs } = this.detectShell();
    const shell = options.shell || detectedShell;

    // Validate and resolve working directory
    const cwd = this.resolveWorkingDirectory(options.cwd);

    // Build environment with some useful defaults
    // These settings ensure consistent terminal behavior across platforms
    const env: Record<string, string> = {
      ...process.env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      TERM_PROGRAM: 'automaker-terminal',
      // Ensure proper locale for character handling
      LANG: process.env.LANG || 'en_US.UTF-8',
      LC_ALL: process.env.LC_ALL || process.env.LANG || 'en_US.UTF-8',
      ...options.env,
    };

    logger.info(`Creating session ${id} with shell: ${shell} in ${cwd}`);

    const ptyProcess = pty.spawn(shell, shellArgs, {
      name: 'xterm-256color',
      cols: options.cols || 80,
      rows: options.rows || 24,
      cwd,
      env,
    });

    const session: TerminalSession = {
      id,
      pty: ptyProcess,
      cwd,
      createdAt: new Date(),
      shell,
      scrollbackBuffer: new CircularBuffer(MAX_SCROLLBACK_SIZE),
      outputBuffer: '',
      flushTimeout: null,
      resizeInProgress: false,
      resizeDebounceTimeout: null,
    };

    this.sessions.set(id, session);

    // Flush buffered output to clients (throttled)
    const flushOutput = () => {
      if (session.outputBuffer.length === 0) return;

      // Send in batches if buffer is large
      let dataToSend = session.outputBuffer;
      if (dataToSend.length > OUTPUT_BATCH_SIZE) {
        dataToSend = session.outputBuffer.slice(0, OUTPUT_BATCH_SIZE);
        session.outputBuffer = session.outputBuffer.slice(OUTPUT_BATCH_SIZE);
        // Schedule another flush for remaining data
        session.flushTimeout = setTimeout(flushOutput, OUTPUT_THROTTLE_MS);
      } else {
        session.outputBuffer = '';
        session.flushTimeout = null;
      }

      this.dataCallbacks.forEach((cb) => cb(id, dataToSend));
      this.emit('data', id, dataToSend);
    };

    // Forward data events with throttling
    ptyProcess.onData((data) => {
      // Skip ALL output during resize/reconnect to prevent prompt redraw duplication
      // This drops both scrollback AND live output during the suppression window
      // Without this, prompt redraws from SIGWINCH go to live clients causing duplicates
      if (session.resizeInProgress) {
        return;
      }

      // Append to scrollback buffer (automatically trims if too large)
      session.scrollbackBuffer.append(data);

      // Buffer output for throttled live delivery
      session.outputBuffer += data;

      // Schedule flush if not already scheduled
      if (!session.flushTimeout) {
        session.flushTimeout = setTimeout(flushOutput, OUTPUT_THROTTLE_MS);
      }
    });

    // Handle exit
    ptyProcess.onExit(({ exitCode }) => {
      logger.info(`Session ${id} exited with code ${exitCode}`);
      this.sessions.delete(id);
      this.exitCallbacks.forEach((cb) => cb(id, exitCode));
      this.emit('exit', id, exitCode);
    });

    logger.info(`Session ${id} created successfully`);
    return session;
  }

  /**
   * Write data to a terminal session
   */
  write(sessionId: string, data: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      logger.warn(`Session ${sessionId} not found`);
      return false;
    }
    session.pty.write(data);
    return true;
  }

  /**
   * Resize a terminal session
   * @param suppressOutput - If true, suppress output during resize to prevent duplicate prompts.
   *                         Should be false for the initial resize so the first prompt isn't dropped.
   */
  resize(sessionId: string, cols: number, rows: number, suppressOutput: boolean = true): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      logger.warn(`Session ${sessionId} not found for resize`);
      return false;
    }
    try {
      // Only suppress output on subsequent resizes, not the initial one
      // This prevents the shell's first prompt from being dropped
      if (suppressOutput) {
        session.resizeInProgress = true;
        // Clear any pending debounce timeout to prevent stale state
        if (session.resizeDebounceTimeout) {
          clearTimeout(session.resizeDebounceTimeout);
          session.resizeDebounceTimeout = null;
        }
      }

      // Perform the actual resize - may throw
      session.pty.resize(cols, rows);

      // Clear resize flag after a delay (allow prompt to settle)
      // Only set timeout AFTER successful resize
      if (suppressOutput) {
        session.resizeDebounceTimeout = setTimeout(() => {
          session.resizeInProgress = false;
          session.resizeDebounceTimeout = null;
        }, RESIZE_DEBOUNCE_MS);
      }

      return true;
    } catch (error) {
      logger.error(`Error resizing session ${sessionId}:`, error);
      // Ensure clean state on error
      session.resizeInProgress = false;
      // Also clear timeout in case it was set before error
      if (session.resizeDebounceTimeout) {
        clearTimeout(session.resizeDebounceTimeout);
        session.resizeDebounceTimeout = null;
      }
      return false;
    }
  }

  /**
   * Kill a terminal session
   * Attempts graceful SIGTERM first, then SIGKILL after 1 second if still alive
   */
  killSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }
    try {
      // Clean up flush timeout
      if (session.flushTimeout) {
        clearTimeout(session.flushTimeout);
        session.flushTimeout = null;
      }
      // Clean up resize debounce timeout
      if (session.resizeDebounceTimeout) {
        clearTimeout(session.resizeDebounceTimeout);
        session.resizeDebounceTimeout = null;
      }

      // First try graceful SIGTERM to allow process cleanup
      logger.info(`Session ${sessionId} sending SIGTERM`);
      session.pty.kill('SIGTERM');

      // Schedule SIGKILL fallback if process doesn't exit gracefully
      // The onExit handler will remove session from map when it actually exits
      setTimeout(() => {
        if (this.sessions.has(sessionId)) {
          logger.info(`Session ${sessionId} still alive after SIGTERM, sending SIGKILL`);
          try {
            session.pty.kill('SIGKILL');
          } catch {
            // Process may have already exited
          }
          // Force remove from map if still present
          this.sessions.delete(sessionId);
        }
      }, 1000);

      logger.info(`Session ${sessionId} kill initiated`);
      return true;
    } catch (error) {
      logger.error(`Error killing session ${sessionId}:`, error);
      // Still try to remove from map even if kill fails
      this.sessions.delete(sessionId);
      return false;
    }
  }

  /**
   * Get a session by ID
   */
  getSession(sessionId: string): TerminalSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get scrollback buffer for a session (for replay on reconnect)
   */
  getScrollback(sessionId: string): string | null {
    const session = this.sessions.get(sessionId);
    return session ? session.scrollbackBuffer.getAll() : null;
  }

  /**
   * Get scrollback buffer and clear pending output buffer to prevent duplicates
   * Call this when establishing a new WebSocket connection
   * This prevents data that's already in scrollback from being sent again via data callback
   */
  getScrollbackAndClearPending(sessionId: string): string | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    // Clear any pending output that hasn't been flushed yet
    // This data is already in scrollbackBuffer
    session.outputBuffer = '';
    if (session.flushTimeout) {
      clearTimeout(session.flushTimeout);
      session.flushTimeout = null;
    }

    // NOTE: Don't set resizeInProgress here - it causes blank terminals
    // if the shell hasn't output its prompt yet when WebSocket connects.
    // The resize() method handles suppression during actual resize events.

    return session.scrollbackBuffer.getAll();
  }

  /**
   * Get all active sessions
   */
  getAllSessions(): Array<{
    id: string;
    cwd: string;
    createdAt: Date;
    shell: string;
  }> {
    return Array.from(this.sessions.values()).map((s) => ({
      id: s.id,
      cwd: s.cwd,
      createdAt: s.createdAt,
      shell: s.shell,
    }));
  }

  /**
   * Subscribe to data events
   */
  onData(callback: DataCallback): () => void {
    this.dataCallbacks.add(callback);
    return () => this.dataCallbacks.delete(callback);
  }

  /**
   * Subscribe to exit events
   */
  onExit(callback: ExitCallback): () => void {
    this.exitCallbacks.add(callback);
    return () => this.exitCallbacks.delete(callback);
  }

  /**
   * Clean up all sessions
   */
  cleanup(): void {
    logger.info(`Cleaning up ${this.sessions.size} sessions`);
    this.sessions.forEach((session, id) => {
      try {
        // Clean up flush timeout
        if (session.flushTimeout) {
          clearTimeout(session.flushTimeout);
        }
        session.pty.kill();
      } catch {
        // Ignore errors during cleanup
      }
      this.sessions.delete(id);
    });
  }
}

// Singleton instance
let terminalService: TerminalService | null = null;

export function getTerminalService(): TerminalService {
  if (!terminalService) {
    terminalService = new TerminalService();
  }
  return terminalService;
}
