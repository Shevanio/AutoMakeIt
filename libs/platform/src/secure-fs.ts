/**
 * Secure File System Adapter
 *
 * All file I/O operations must go through this adapter to enforce
 * ALLOWED_ROOT_DIRECTORY restrictions at the actual access point,
 * not just at the API layer. This provides defense-in-depth security.
 *
 * This module also implements:
 * - Concurrency limiting via p-limit to prevent ENFILE/EMFILE errors
 * - Retry logic with exponential backoff for transient file descriptor errors
 */

import fs from 'fs/promises';
import type { Dirent } from 'fs';
import path from 'path';
import pLimit from 'p-limit';
import { validatePath } from './security.js';

/**
 * Configuration for file operation throttling
 */
interface ThrottleConfig {
  /** Maximum concurrent file operations (default: 100) */
  maxConcurrency: number;
  /** Maximum retry attempts for ENFILE/EMFILE errors (default: 3) */
  maxRetries: number;
  /** Base delay in ms for exponential backoff (default: 100) */
  baseDelay: number;
  /** Maximum delay in ms for exponential backoff (default: 5000) */
  maxDelay: number;
}

const DEFAULT_CONFIG: ThrottleConfig = {
  maxConcurrency: 100,
  maxRetries: 3,
  baseDelay: 100,
  maxDelay: 5000,
};

let config: ThrottleConfig = { ...DEFAULT_CONFIG };
let fsLimit = pLimit(config.maxConcurrency);

/**
 * Configure the file operation throttling settings
 *
 * @param newConfig - Partial configuration to merge with defaults
 * @throws Error if attempting to change maxConcurrency with operations in flight
 * @example
 * ```typescript
 * configureThrottling({
 *   maxConcurrency: 50,  // Reduce from default 100
 *   maxRetries: 5        // Increase retry attempts
 * });
 * ```
 */
export function configureThrottling(newConfig: Partial<ThrottleConfig>): void {
  const newConcurrency = newConfig.maxConcurrency;

  if (newConcurrency !== undefined && newConcurrency !== config.maxConcurrency) {
    if (fsLimit.activeCount > 0 || fsLimit.pendingCount > 0) {
      throw new Error(
        `[SecureFS] Cannot change maxConcurrency while operations are in flight. Active: ${fsLimit.activeCount}, Pending: ${fsLimit.pendingCount}`
      );
    }
    fsLimit = pLimit(newConcurrency);
  }

  config = { ...config, ...newConfig };
}

/**
 * Get the current throttling configuration
 *
 * @returns Read-only copy of current throttle configuration
 * @example
 * ```typescript
 * const config = getThrottlingConfig();
 * console.log(`Max concurrent operations: ${config.maxConcurrency}`);
 * ```
 */
export function getThrottlingConfig(): Readonly<ThrottleConfig> {
  return { ...config };
}

/**
 * Get the number of pending operations in the queue
 *
 * @returns Number of operations waiting to execute
 * @example
 * ```typescript
 * const pending = getPendingOperations();
 * if (pending > 50) {
 *   console.warn('High queue depth:', pending);
 * }
 * ```
 */
export function getPendingOperations(): number {
  return fsLimit.pendingCount;
}

/**
 * Get the number of active operations currently running
 *
 * @returns Number of operations currently executing
 * @example
 * ```typescript
 * const active = getActiveOperations();
 * console.log(`Currently processing ${active} file operations`);
 * ```
 */
export function getActiveOperations(): number {
  return fsLimit.activeCount;
}

/**
 * Error codes that indicate file descriptor exhaustion
 */
const FILE_DESCRIPTOR_ERROR_CODES = new Set(['ENFILE', 'EMFILE']);

/**
 * Check if an error is a file descriptor exhaustion error
 */
function isFileDescriptorError(error: unknown): boolean {
  if (error && typeof error === 'object' && 'code' in error) {
    return FILE_DESCRIPTOR_ERROR_CODES.has((error as { code: string }).code);
  }
  return false;
}

/**
 * Calculate delay with exponential backoff and jitter
 */
function calculateDelay(attempt: number): number {
  const exponentialDelay = config.baseDelay * Math.pow(2, attempt);
  const jitter = Math.random() * config.baseDelay;
  return Math.min(exponentialDelay + jitter, config.maxDelay);
}

/**
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute a file operation with throttling and retry logic
 */
async function executeWithRetry<T>(operation: () => Promise<T>, operationName: string): Promise<T> {
  return fsLimit(async () => {
    let lastError: unknown;

    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;

        if (isFileDescriptorError(error) && attempt < config.maxRetries) {
          const delay = calculateDelay(attempt);
          console.warn(
            `[SecureFS] ${operationName}: File descriptor error (attempt ${attempt + 1}/${config.maxRetries + 1}), retrying in ${delay}ms`
          );
          await sleep(delay);
          continue;
        }

        throw error;
      }
    }

    throw lastError;
  });
}

/**
 * Wrapper around fs.access that validates path first
 *
 * Checks file existence and permissions with automatic path validation
 * and retry logic for file descriptor errors.
 *
 * @param filePath - Path to check (validated against security policy)
 * @param mode - Optional access mode (fs.constants.R_OK, W_OK, X_OK)
 * @throws PathNotAllowedError if path is outside allowed directories
 * @throws Error if file doesn't exist or permissions are insufficient
 * @example
 * ```typescript
 * import { constants } from 'fs';
 *
 * try {
 *   await access('/path/to/file.txt', constants.R_OK | constants.W_OK);
 *   console.log('File is readable and writable');
 * } catch (error) {
 *   console.error('Access denied');
 * }
 * ```
 */
export async function access(filePath: string, mode?: number): Promise<void> {
  const validatedPath = validatePath(filePath);
  return executeWithRetry(() => fs.access(validatedPath, mode), `access(${filePath})`);
}

/**
 * Wrapper around fs.readFile that validates path first
 *
 * Reads file contents with automatic path validation, throttling,
 * and retry logic for file descriptor errors.
 *
 * @param filePath - Path to file (validated against security policy)
 * @param encoding - Optional encoding ('utf-8', 'base64', etc.). If omitted, returns Buffer
 * @returns File contents as string (if encoding specified) or Buffer
 * @throws PathNotAllowedError if path is outside allowed directories
 * @throws Error if file doesn't exist or can't be read
 * @example
 * ```typescript
 * // Read as string
 * const text = await readFile('/path/to/file.txt', 'utf-8');
 *
 * // Read as buffer
 * const buffer = await readFile('/path/to/image.png');
 * ```
 */
export async function readFile(
  filePath: string,
  encoding?: BufferEncoding
): Promise<string | Buffer> {
  const validatedPath = validatePath(filePath);
  return executeWithRetry<string | Buffer>(() => {
    if (encoding) {
      return fs.readFile(validatedPath, encoding);
    }
    return fs.readFile(validatedPath);
  }, `readFile(${filePath})`);
}

/**
 * Wrapper around fs.writeFile that validates path first
 *
 * Writes data to file with automatic path validation, throttling,
 * and restrictive permissions (0600) for security.
 *
 * @param filePath - Path to file (validated against security policy)
 * @param data - Data to write (string or Buffer)
 * @param encoding - Optional encoding when data is string (default: 'utf-8')
 * @throws PathNotAllowedError if path is outside allowed directories
 * @throws Error if file can't be written
 * @example
 * ```typescript
 * // Write text file
 * await writeFile('/path/to/file.txt', 'Hello world', 'utf-8');
 *
 * // Write binary data
 * await writeFile('/path/to/data.bin', buffer);
 *
 * // File created with 0600 permissions (owner read/write only)
 * ```
 */
export async function writeFile(
  filePath: string,
  data: string | Buffer,
  encoding?: BufferEncoding
): Promise<void> {
  const validatedPath = validatePath(filePath);

  return executeWithRetry(async () => {
    // Write the file
    await fs.writeFile(validatedPath, data, encoding);

    // Set restrictive permissions (0600 = rw-------)
    // Owner can read/write, no permissions for group or others
    // This prevents other users from reading sensitive data
    try {
      await fs.chmod(validatedPath, 0o600);
    } catch (chmodError) {
      // On Windows or some filesystems, chmod may not be supported
      // Log warning but don't fail the write operation
      // The file was successfully written, just couldn't set permissions
      if (process.platform !== 'win32') {
        // Only warn on non-Windows platforms where chmod should work
        console.warn(`[SecureFS] Failed to set permissions on ${filePath}:`, chmodError);
      }
    }
  }, `writeFile(${filePath})`);
}

/**
 * Wrapper around fs.mkdir that validates path first
 *
 * @param dirPath - Path to directory (validated against security policy)
 * @param options - Options object with recursive flag and mode
 * @returns Path to created directory (when recursive=true), otherwise undefined
 * @throws PathNotAllowedError if path is outside allowed directories
 * @example
 * ```typescript
 * await mkdir('/path/to/new/dir', { recursive: true });
 * ```
 */
export async function mkdir(
  dirPath: string,
  options?: { recursive?: boolean; mode?: number }
): Promise<string | undefined> {
  const validatedPath = validatePath(dirPath);
  return executeWithRetry(() => fs.mkdir(validatedPath, options), `mkdir(${dirPath})`);
}

/**
 * Wrapper around fs.readdir that validates path first
 */
export async function readdir(
  dirPath: string,
  options?: { withFileTypes?: false; encoding?: BufferEncoding }
): Promise<string[]>;
export async function readdir(
  dirPath: string,
  options: { withFileTypes: true; encoding?: BufferEncoding }
): Promise<Dirent[]>;
export async function readdir(
  dirPath: string,
  options?: { withFileTypes?: boolean; encoding?: BufferEncoding }
): Promise<string[] | Dirent[]> {
  const validatedPath = validatePath(dirPath);
  return executeWithRetry<string[] | Dirent[]>(() => {
    if (options?.withFileTypes === true) {
      return fs.readdir(validatedPath, { withFileTypes: true });
    }
    return fs.readdir(validatedPath);
  }, `readdir(${dirPath})`);
}

/**
 * Wrapper around fs.stat that validates path first
 */
export async function stat(filePath: string): Promise<ReturnType<typeof fs.stat>> {
  const validatedPath = validatePath(filePath);
  return executeWithRetry(() => fs.stat(validatedPath), `stat(${filePath})`);
}

/**
 * Wrapper around fs.rm that validates path first
 */
export async function rm(
  filePath: string,
  options?: { recursive?: boolean; force?: boolean }
): Promise<void> {
  const validatedPath = validatePath(filePath);
  return executeWithRetry(() => fs.rm(validatedPath, options), `rm(${filePath})`);
}

/**
 * Wrapper around fs.unlink that validates path first
 */
export async function unlink(filePath: string): Promise<void> {
  const validatedPath = validatePath(filePath);
  return executeWithRetry(() => fs.unlink(validatedPath), `unlink(${filePath})`);
}

/**
 * Wrapper around fs.copyFile that validates both paths first
 */
export async function copyFile(src: string, dest: string, mode?: number): Promise<void> {
  const validatedSrc = validatePath(src);
  const validatedDest = validatePath(dest);
  return executeWithRetry(
    () => fs.copyFile(validatedSrc, validatedDest, mode),
    `copyFile(${src}, ${dest})`
  );
}

/**
 * Wrapper around fs.appendFile that validates path first
 */
export async function appendFile(
  filePath: string,
  data: string | Buffer,
  encoding?: BufferEncoding
): Promise<void> {
  const validatedPath = validatePath(filePath);
  return executeWithRetry(
    () => fs.appendFile(validatedPath, data, encoding),
    `appendFile(${filePath})`
  );
}

/**
 * Wrapper around fs.rename that validates both paths first
 */
export async function rename(oldPath: string, newPath: string): Promise<void> {
  const validatedOldPath = validatePath(oldPath);
  const validatedNewPath = validatePath(newPath);
  return executeWithRetry(
    () => fs.rename(validatedOldPath, validatedNewPath),
    `rename(${oldPath}, ${newPath})`
  );
}

/**
 * Wrapper around fs.lstat that validates path first
 * Returns file stats without following symbolic links
 */
export async function lstat(filePath: string): Promise<ReturnType<typeof fs.lstat>> {
  const validatedPath = validatePath(filePath);
  return executeWithRetry(() => fs.lstat(validatedPath), `lstat(${filePath})`);
}

/**
 * Wrapper around path.join that returns resolved path
 * Does NOT validate - use this for path construction, then pass to other operations
 */
export function joinPath(...pathSegments: string[]): string {
  return path.join(...pathSegments);
}

/**
 * Wrapper around path.resolve that returns resolved path
 * Does NOT validate - use this for path construction, then pass to other operations
 */
export function resolvePath(...pathSegments: string[]): string {
  return path.resolve(...pathSegments);
}
